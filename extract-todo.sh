#!/bin/bash
# Usage: ./extract-todo.sh <start-ref> <end-ref> [output-file]
# Example: ./extract-todo.sh abc123 main migration-todo.md

START_REF=$1
END_REF=$2
OUTPUT=${3:-migration-todo.md}

if [ -z "$START_REF" ] || [ -z "$END_REF" ]; then
  echo "Usage: $0 <start-ref> <end-ref> [output-file]"
  exit 1
fi

git log $START_REF..$END_REF --pretty=format:"- [ ] %h %s (%ad, %an)" --date=short > "$OUTPUT"

echo "TODO list written to $OUTPUT"
