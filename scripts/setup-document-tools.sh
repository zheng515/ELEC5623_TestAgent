#!/usr/bin/env bash
set -euo pipefail
# Install local tools; uploaded documents are never sent to an OCR cloud service.
case "$(uname -s)" in
  Darwin)
    if ! command -v tesseract >/dev/null 2>&1; then
      command -v brew >/dev/null 2>&1 || { echo "Install Homebrew, then run: brew install tesseract" >&2; exit 1; }
      brew install tesseract
    fi
    [[ -x /usr/bin/textutil ]] || { echo "macOS textutil is required for legacy Word conversion." >&2; exit 1; }
    ;;
  Linux)
    if ! command -v tesseract >/dev/null 2>&1 || ! command -v soffice >/dev/null 2>&1; then
      command -v apt-get >/dev/null 2>&1 || { echo "Install Tesseract, English language data, and LibreOffice Writer with your package manager." >&2; exit 1; }
      installer=()
      if [[ "$EUID" -ne 0 ]]; then installer=(sudo); fi
      "${installer[@]}" apt-get update
      "${installer[@]}" apt-get install -y tesseract-ocr tesseract-ocr-eng libreoffice-writer
    fi
    ;;
  *) echo "Install Tesseract and a compatible LibreOffice CLI on a supported POSIX platform." >&2; exit 1 ;;
esac
tesseract --list-langs
echo "Document tools installed. Restart the backend and check document import readiness in the task form."
