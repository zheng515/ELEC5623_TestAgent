# Isolated evaluation image; does not replace the application's default image.
FROM reqtest-python:1
USER 0:0
RUN pip install --no-cache-dir MarkupSafe==2.1.5 pretend==1.0.9 pytest-timeout==2.3.1 pytest-xprocess==0.23.0 ephemeral-port-reserve==1.1.4 cryptography==43.0.3 cffi==1.17.1 pycparser==2.22 psutil==6.1.0 watchdog==5.0.3
USER 65534:65534
