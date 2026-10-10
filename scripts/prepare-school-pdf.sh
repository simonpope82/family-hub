#!/usr/bin/env bash
# Step 1 of importing a school weekly plan PDF.
# Usage: scripts/prepare-school-pdf.sh path/to/plan.pdf week43-2026
# Copies the PDF into data/school-import/, renders every page to PNG and dumps the text,
# and creates week43-2026.json from the previous plan as a template to edit.
# (School timetables are tables whose text extraction comes out jumbled, so the grid is read
#  from the PNG by a person or by the assistant, then typed into the JSON.)
set -euo pipefail
PDF="$1"; NAME="${2:-$(basename "$PDF" .pdf)}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/data/school-import"
mkdir -p "$DIR/$NAME"
cp "$PDF" "$DIR/$NAME.pdf"
pdftoppm -r 160 -png "$DIR/$NAME.pdf" "$DIR/$NAME/page"
pdftotext -layout "$DIR/$NAME.pdf" "$DIR/$NAME/text.txt"
if [ ! -f "$DIR/$NAME.json" ]; then
  TEMPLATE=$(ls -t "$DIR"/*.json 2>/dev/null | head -1 || true)
  [ -n "$TEMPLATE" ] && cp "$TEMPLATE" "$DIR/$NAME.json" && echo "Template copied from $(basename "$TEMPLATE") — update weekStart, classes, events, reminders, homework."
fi
echo "Pages: $DIR/$NAME/page-*.png   Text: $DIR/$NAME/text.txt   Plan JSON: $DIR/$NAME.json"
echo "Then apply: scripts/apply-school-plan.sh $NAME.json <memberId> [7A|7B|7C] [group]"
