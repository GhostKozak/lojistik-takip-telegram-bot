import sys
import os
import json
import subprocess

# Mock image (small blank png)
# We just want to see if the script starts and initializes models without crashing
# Actually, I'll just run the script with --help or something if it had it, 
# but it reads from stdin. I'll send it an empty buffer and see if it returns the "No image data" error.

p = subprocess.Popen(['python', 'apps/bot/scripts/ocr_reader.py'], 
                     stdin=subprocess.PIPE, 
                     stdout=subprocess.PIPE, 
                     stderr=subprocess.PIPE)

stdout, stderr = p.communicate(input=b'')

print(f"STDOUT: {stdout.decode()}")
print(f"STDERR: {stderr.decode()}")
