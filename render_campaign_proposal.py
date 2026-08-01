from pathlib import Path
import fitz

pdf = Path(r"C:\Users\redcl\ai project\.docx-render\campaign-os-proposal-ai-final.pdf")
out = pdf.parent / "pages-ai-final"
out.mkdir(parents=True, exist_ok=True)
document = fitz.open(pdf)
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(out / f"page-{index + 1:02d}.png")
print(f"{len(document)} pages rendered to {out}")
