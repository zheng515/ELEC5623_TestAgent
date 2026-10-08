"""Run with python -m evaluation. Default mode validates data without network access."""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from app.core.config import Settings
from app.services.llm import create_llm
from evaluation.corpus import DEFAULT_CORPUS, load_corpus
from evaluation.runner import failed, make_report, markdown_report, run_case


def save_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Keep a usable checkpoint even if a later model call or process is interrupted.
    for target, contents in [
        (path, json.dumps(report, indent=2) + "\n"),
        (path.with_suffix(".md"), markdown_report(report)),
    ]:
        with tempfile.NamedTemporaryFile(mode="w", dir=target.parent, delete=False) as temporary:
            temporary.write(contents)
            temp_path = temporary.name
        os.replace(temp_path, target)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["dry-run", "live", "replay"], default="dry-run")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--stage", choices=["all", "analysis", "oracle"], default="all")
    parser.add_argument("--case", action="append", default=[], help="Select an exact case ID.")
    parser.add_argument("--limit", type=int, help="Maximum unique cases, before repetitions.")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--responses", type=Path, help="A saved evaluation JSON for replay.")
    parser.add_argument("--output", type=Path, default=Path("data/evaluations/latest.json"))
    args = parser.parse_args(argv)
    if not 1 <= args.repeat <= 5 or args.limit is not None and args.limit < 1:
        parser.error("repeat must be 1-5 and limit must be positive.")
    if args.output.suffix != ".json":
        parser.error("output must end in .json.")
    targets = {args.output.resolve(), args.output.with_suffix(".md").resolve()}
    if args.corpus.resolve() in targets or (args.responses and args.responses.resolve() in targets):
        parser.error("output must not overwrite the corpus or replay input.")
    try:
        corpus, fingerprint = load_corpus(args.corpus)
        selected = [("analysis", case) for case in corpus.analysis]
        selected += [("oracle", case) for case in corpus.oracle]
        unknown = set(args.case) - {case.id for _, case in selected}
        if unknown:
            raise ValueError(f"Unknown case IDs: {', '.join(sorted(unknown))}")
        selected = [
            (stage, case)
            for stage, case in selected
            if (args.stage in {"all", stage} and (not args.case or case.id in args.case))
        ]
        if args.limit:
            selected = selected[: args.limit]
        if not selected:
            raise ValueError("No cases selected.")
        if args.mode == "dry-run":
            print(
                f"Corpus valid: {len(selected)} cases, {len(selected) * args.repeat} planned calls."
            )
            print(f"Corpus SHA-256: {fingerprint}")
            for stage, case in selected:
                print(f"{stage}: {case.id} ({case.category})")
            print("No model calls made. No quality score measured.")
            return 0
        replay = {}
        llm = None
        model = None
        response_origin = args.mode
        if args.mode == "replay":
            if args.responses is None:
                raise ValueError("replay requires --responses.")
            original = json.loads(args.responses.read_text())
            if original.get("version") != 1 or original.get("corpus_sha256") != fingerprint:
                raise ValueError("Replay report version or corpus fingerprint differs.")
            model = original.get("model")
            response_origin = original.get("response_origin", original["mode"])
            for record in original["records"]:
                key = (record["stage"], record["case_id"], record["repeat"])
                if key in replay:
                    raise ValueError("Duplicate replay sample.")
                replay[key] = record["calls"]
        else:
            settings = Settings()
            llm = create_llm(settings)
            if llm is None:
                raise ValueError(
                    "Live evaluation requires enabled LLM access and resolved credentials."
                )
            model = settings.llm_model
        report_options = dict(
            corpus_sha256=fingerprint,
            mode=args.mode,
            model=model,
            expected_samples=len(selected) * args.repeat,
            response_origin=response_origin,
        )
        records = []
        print(f"Running {len(selected) * args.repeat} samples in {args.mode} mode.", flush=True)
        for repeat in range(1, args.repeat + 1):
            for stage, case in selected:
                key = (stage, case.id, repeat)
                record = run_case(
                    case,
                    stage,
                    repeat,
                    llm=llm,
                    replay=(replay.get(key, []) if args.mode == "replay" else None),
                )
                records.append(record)
                save_report(
                    args.output,
                    make_report(records, complete=False, **report_options),
                )
                print(f"{case.id} [{repeat}]: {'FAIL' if failed(record) else 'PASS'}", flush=True)
        save_report(
            args.output,
            make_report(records, complete=True, **report_options),
        )
        print(f"Saved {args.output} and {args.output.with_suffix('.md')}")
        return int(any(failed(record) for record in records))
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Evaluation error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
