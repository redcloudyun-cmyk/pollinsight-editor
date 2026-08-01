from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

files = sorted(Path(r"C:\Users\redcl\ai project\.docx-render\pages-ai-strategy").glob("page-*.png"))
thumbs = []
for file in files:
    image = Image.open(file).convert("RGB")
    image.thumbnail((306, 396))
    tile = Image.new("RGB", (326, 430), "white")
    tile.paste(image, ((326-image.width)//2, 22))
    ImageDraw.Draw(tile).text((8, 5), file.stem, fill="black")
    thumbs.append(ImageOps.expand(tile, border=1, fill="#CBD5E1"))
sheet = Image.new("RGB", (326*3, 430*((len(thumbs)+2)//3)), "#E2E8F0")
for index, thumb in enumerate(thumbs):
    sheet.paste(thumb, ((index%3)*326, (index//3)*430))
sheet.save(r"C:\Users\redcl\ai project\.docx-render\proposal-contact-sheet-ai-strategy.png")
