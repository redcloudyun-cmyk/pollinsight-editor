# Development baseline update — 2026-07-27

This update supplements `development-baseline.md` and records the completed
AI-first handoff implementation.

## Completed connection

- The authenticated proposal screen collects minimum factual input, optional
  portrait, campaign keyword and promise.
- The proposal service keeps factual identifiers separate from generated copy,
  asks a focused follow-up question, and returns three distinct editable
  multi-page design states: person-led, information-led, and poster-led.
- Choosing a proposal opens the existing editor, preserves its elements and
  template roles, and creates a server-backed project automatically.
- Published templates are available from the editor's template panel, not only
  from the administrator's template studio.
- Locked template elements are excluded from AI style changes.
- Line elements are editable paths: solid, dashed and dotted styles, color,
  thickness, dash metrics, independent start/end caps, and draggable bend
  points are available in the element inspector.
- Lines and shape elements support both numeric rotation and a canvas rotation
  handle. Line paths, endpoint/bend handles, and the rotation handle share the
  same path-center coordinate system after rotation.
- Rotation is a common inspector property for text, images, shapes, lines,
  tables, and charts. Text bounds are calculated from rotated corners,
  including text that overlaps a page edge.
- The editor provides a non-exported work area around each page so off-page
  elements can be viewed and edited. Preview and downloaded files render only
  the configured page dimensions.
- Every editable element supports common opacity and configurable shadow
  controls (color, x/y offset, blur, and shadow opacity). The support launcher
  can be repositioned by dragging and retains its chosen screen position.
- The font picker supports multi-file selection and drag-and-drop registration
  for TTF, OTF, WOFF, and WOFF2 files, with Gothic, Myeongjo, and handwriting
  categories alongside recent, all, and favorites views.
- The editable work area has a separately configurable background color. Page
  navigation supports an explicit page-add action, independently scrollable
  thumbnails, and wheel navigation at the top/bottom edge of the workspace.
- The editor also presents pages as a continuous vertical document: the active
  page remains directly editable, while preceding and following pages are
  rendered above and below it at the same scale. Adjacent page previews are
  clickable, so the stack can be scrolled as one connected canvas without
  losing the active-page editing model or export boundaries. The editor keeps
  a larger horizontal work margin for off-page assets and a compact vertical
  margin so adjacent pages do not appear separated by a large blank block.
- Tables support drag selection of a rectangular cell range. Cell text styling
  can be applied to the entire range, including font family, size, color,
  bold, italic, underline, alignment, and cell background color. The selected
  range is rendered with a blue translucent fill, a strong outer outline,
  corner markers, and a cell-count badge during drag selection.
- Table border controls now distinguish a dragged cell range from the entire
  table. The selected range can receive solid, dashed, or dotted inner and
  cell-outline borders with independent color, thickness, dash length, and
  dash gap; the same controls can instead set the table-wide default border.
- The administration model separates complete multi-page templates from
  single reusable clipart elements. Complete templates replace a design state;
  clipart elements are inserted into the current page from the asset library.
- Personal and administrator dashboards use the same credit ledger and usage
  event data. Monthly plan credits, AI request counts, active editor minutes,
  project counts, and recent credit events are now available for reporting.
- The digital profile service baseline is documented in
  `docs/digital-profile-service-plan.md`. Its first product slice provides
  template-based profile creation, private/public publishing, public URLs,
  mobile rendering, and privacy-preserving view/link-click event counts.

## Remaining baseline work

- Constraint validation for safe zones, collisions, and text overflow.
- Persisted Ruleset entities and reusable asset analysis workflow.
- Revision history and organization/project role controls.
- The multi-step approval workflow remains explicitly deferred.
