MELICARE Complete Bundle v2

Open MELICARE.html.

Unified application switcher is available in:
- MELIOR
- MELIOCR
- MELIVoice

Links:
All destinations (apps, MELIDx sub-tools, SSO token handoff) are defined once in
assets/melicare-routes.js. Change a URL there; the homepage, dashboards, app switcher,
MELIDx menus and DANH_SACH_TRANG.html follow automatically.
- In HTML use <a data-mc-route="meliocr">; in scripts use MELICARE_SITE.open('meliocr').
- sso:true appends ?token=<access token> when opening (assets/meli-auth.js).
- https URLs open in a new tab, local pages in the same tab.

Clinical concepts added:
- MELIDiabetes
- MELIAlz

V5 updates:
- MELIDiabetes and MELIAlz use the same clinical-card grid as other apps.
- Explicit Home icon added to MELIOR, MELIOCR, MELIVoice.
- MELIOCR and MELIVoice product wordmarks standardized to MELIOR style.

V6 updates:
- Home button moved next to app-switch dropdown on MELIOR/MELIOCR/MELIVoice.
- MELIMed renamed to MELIVLM.
- Added MELI_VLM.html with image upload, image QA, report generation, side-by-side image review, and conversation history.

V7 updates:
- MELI VLM redesigned with MELICARE navy/white tone.
- Upload processing progress UI added.
- Uploaded images are clickable and shown in viewer.
- Dedicated Generate Report button added.
- Conversation history stored in browser localStorage.

V8 updates:
- MELI VLM redesigned in ChatGPT-like layout.
- Left sidebar contains Projects and History.
- Chat composer pinned at bottom.
- Right panel shows uploaded images and selected viewer.
- Upload progress and local conversation history preserved.

V9 updates:
- MELI VLM rebuilt with explicit DOM references and validated JavaScript syntax.
- Larger typography across header, sidebar, chat, composer and image panel.
- History / Projects panes and uploaded-image viewer preserved.

V10 updates:
- Fixed MELI VLM page scrolling; whole page scrolls normally and side panels remain usable.
- MELICDSS card now opens https://cdss.leira.com.vn.
- JavaScript syntax of MELI VLM revalidated successfully.

V11 updates:
- Removed the Chat / Tạo báo cáo segmented control from MELI VLM header.
- Added MEDIStroke.html and linked the MEDIStroke card on MELICARE.
- MEDIStroke supports file upload, direct patient/lab entry, data table, trend charts, abnormal-value highlights, demo stroke-risk index, explanations, and recommendations.
- MEDIStroke risk output is explicitly marked as a UI prototype, not a validated clinical model.

V12 updates:
- MEDIStroke workflow redesigned as a horizontal 3-stage timeline.
- Timeline visually progresses from Data Input -> Trend Analysis -> Prediction & Explanation after analysis.

V13 updates:
- MEDIStroke analysis width reduced and typography enlarged.
- Analysis blocks rearranged into tighter 2-column composition to reduce blank space.
- Risk panel placed beside explanation/recommendation stack.

V14 updates:
- MELICARE clinical section simplified to MELI VLM, MELI CDSS, MELI Dx, MELI PostOp.
- Added MELIDx diagnostic hub with top menu for Mind, Stroke, Cardio, Alzheimer, Diabetes.
- Existing stroke page is available as MELIStroke.html and included in the diagnostic menu.

V15 updates:
- Removed the disease submenu from MELIDx.
- Redesigned MELIDx disease cards with larger medical icons, cleaner visual hierarchy, and two-column layout.

V16 updates:
- MELIDx cards made smaller and denser.
- Desktop layout changed to 3 columns; reduced icon size, padding, typography and card height.

V17 updates:
- MELIStroke page rebuilt: compact patient-entry table + alternative upload tile + centered Analyze button.
- Analysis output now includes trends, patient data comments, stroke risk pie, explanation factors, and lifestyle recommendations.
- Removed the large MELIStroke intro copy and prototype badge from the page body.

V18 updates:
- Removed the duplicated MELI Dx hero/title/description block.
- Added Home button to MELIDx header.
- Added application switcher dropdown to MELIDx header for MELICARE, MELIOR, MELI OCR, MELI Voice, MELI VLM, MELI CDSS, MELI Dx and MELI Guide.

V19 updates:
- MELIStroke redesigned with a three-stage progress timeline.
- Patient input rebuilt into grouped, icon-led clinical sections.
- Trend chart redesigned with safe/warning/high background bands and area visualization.
- Attention panel now shows patient position versus thresholds and amount beyond threshold.
- Stroke-risk area shows AI probability plus comparison cards for CHA2DS2-VASc and a Framingham-style demo estimate.
- Explanation cards visualize patient value versus threshold.
- Lifestyle recommendations now use visual icons.

V20 updates:
- Rebuilt MELIStroke from a clean standalone HTML structure to remove runtime/layout errors.
- Verified all required DOM IDs exist.
- Verified JavaScript syntax with Node.
- Preserved timeline, grouped patient input, improved trends, threshold visualization, risk comparison, explanation, and lifestyle recommendations.

V21 updates:
- Increased MELIStroke typography throughout.
- Attention and explanation bars now use distinct colors per indicator.
- Reduced unnecessary blank space by tightening grid/card sizing.
- Long content blocks now scroll internally instead of creating large empty/oversized sections.

V22 updates:
- Equalized MELIStroke panel heights row by row to remove visibly uneven blocks.
- Added metric-specific color theming for trend visualization and active metric tabs.
- Reinforced per-indicator colors in attention and explanation cards.
- Expanded internal scroll areas so long lists align more consistently without leaving mismatched bottoms.

V23 updates:
- Compact attention and explanation cards.
- Moved threshold-delta text inline with indicator title/status.
- Moved patient value/threshold detail inline with reason title.
- Reduced bar/card height while preserving colored indicator markers.

V24 updates:
- MELIStroke risk section now shows risk factors across multiple methods.
- Added applicability-aware cards for AI model, CHA2DS2-VASc, ABCD2, Essen Stroke Risk Score, and Framingham Stroke Risk Profile.
- Methods that are not applicable or lack required inputs are shown as N/A instead of being given misleading numeric values.

V25 updates:
- Combined AI stroke probability and multi-method risk scales into one right-side panel.
- Moved Explanation and Recommendations into two stacked panels on the left.
- Tightened heights and internal scrolling to reduce blank space.

V26 updates:
- Redesigned MELI Alz, MELI Diabetes, MELI Cardio, and MELI Mind using the same workflow language as MELI Stroke.
- MELI Alz adds medical-image upload for MRI/PET/CT.
- MELI Cardio adds both cardiac-image upload and EEG signal upload.
- Each page includes grouped clinical input, timeline, trend visualization, threshold analysis, AI risk summary, explanations, and recommendations.

V27 updates:
- MELI Cardio risk assessment panel made narrower.
- Lifestyle & follow-up panel moved beside the risk assessment panel.
- Explanation panel moved below them at full width.

V28 updates:
- MELI Mind: added MRI brain viewer.
- MELI Cardio: unified upload-data box; added EEG waveform viewer and cardiac MRI viewer.

V29 updates:
- Added consistent Home + application-switch dropdown to MELI Cardio, MELI Alz, MELI Diabetes, MELI Stroke, MELI Mind.
- Added new MELI PosOpt page with the same dropdown navigation.
- Updated MELICARE PostOp card to MELI PosOpt and linked it to MELIPosOpt.html.

V30 updates:
- MELI Stroke explanation panel shortened to reduce height mismatch.
- Explanation list now scrolls inside a shorter container.
- Recommendation panel stays directly below with no forced empty space.

V31 updates:
- MELI Mind: MRI viewer is hidden initially and only appears after clicking Analyze; moved to bottom-right aligned with Lifestyle.
- MELI Diabetes: narrower Risk Assessment panel; Lifestyle moved beside it on the same row; Explanation moved below.
- MELI Cardio: same compact Risk + Lifestyle side-by-side layout; Explanation below.

V32 bugfix:
- Fixed Analyze button regression on MELI Stroke, Cardio, Alz, Diabetes, and Mind.
- Root cause: legacy dropdown JavaScript referenced removed switcher IDs and threw before Analyze handlers were attached.
- Added null-safe legacy navigation initialization while preserving the new shared dropdown.
- Revalidated required Analyze DOM IDs, click bindings, and JavaScript syntax on all five pages.

V33 updates:
- MELI Diabetes: compact Risk Assessment; Lifestyle moved beside Risk on the same row; Explanation below.
- MELI Cardio: replaced separate cardiac-image and EEG uploads with one Upload Data box; compact Risk + Lifestyle side-by-side; EEG and MRI viewers appear only inside the analysis result section after clicking Analyze.
- MELI Alz: compact Risk + Lifestyle side-by-side; MRI viewer added inside analysis results and appears after clicking Analyze.

V34 updates:
- MELI Cardio: Lifestyle panel made narrower.
- Risk, Lifestyle, and Explanation panels are aligned on the same row on desktop.
- Responsive fallback keeps a clean 2-column / 1-column layout on smaller screens.

V35 updates:
- MELI Cardio threshold cards: moved delta text (e.g. 'Vượt ngưỡng 22 mmHg') onto the same line as the indicator title.
- MELI Cardio explanation cards: moved patient value/threshold detail (e.g. 'Giá trị 152 / ngưỡng 140') onto the same line as the risk-factor title.

V36 updates:
- MELI Diabetes: Risk Assessment panel made narrower.
- Lifestyle & Follow-up moved beside Risk Assessment on the same row and given the wider column.
- Explanation remains full-width below.

V37 updates:
- MELI Alz: MRI Viewer and Risk Assessment placed on the same row with equal widths.
- Explanation and Lifestyle/Follow-up placed on the next row with equal widths.

V38 updates:
- MELI Diabetes: Lifestyle panel made narrower.
- Risk Assessment, Lifestyle & Follow-up, and Explanation are aligned on the same row on desktop.
- Explanation receives the wider column for readability.

V39 updates:
- MELI Diabetes: Lifestyle & Follow-up widened.
- Lifestyle now shows exactly one item per row.
- Explanation panel narrowed and compacted.

V40 updates:
- Added a full MELI PostOp page designed in the same visual/workflow language as MELI Stroke.
- MELI PostOp predicts overall postoperative complication risk and displays likely complication groups: surgical-site infection, pulmonary complication, cardiac complication, acute kidney injury, bleeding/transfusion, and postoperative delirium.
- Includes perioperative trend charts, threshold alerts, explanations, and postoperative follow-up recommendations.
- MELIPosOpt.html kept as a compatibility alias; MELICARE now links to MELIPostOp.html.

V41 updates:
- MELI Stroke: corrected bottom alignment of the lower result area.
- Reduced the visible height of the right-side risk-method list and kept it scrollable internally.
- Tightened bottom spacing so the left and right columns end at a more consistent level.

V42 updates:
- MELI Stroke: lower left and right columns now stretch to the same baseline.
- Right risk panel fills the full row height; its method list uses the remaining space and scrolls internally if needed.

V43 updates:
- Checked and standardized dropdown navigation on every local HTML page.
- Dropdown contains exactly: MELIOR, MELIOCR, MELIVoice, MELIGuide, MELIVLM, MELICDSS, MELIDx, MELIPosOpt.
- The current app is omitted from its own dropdown.
- MELICARE landing page now also has the same application dropdown.

V44 updates:
- MELI Stroke: removed the Framingham risk-method card to reduce the height of the right column.
- Long risk-method, explanation, and recommendation lists now scroll internally instead of stretching the layout.
- Tightened the lower-section height to reduce bottom misalignment.

V45 updates:
- Removed the MELI Mind / MELI PostOp / MELI Cardio / MELI Alz / MELI Diabetes sub-navigation bar from MELI PosOpt/PostOp.
- Kept only the main application dropdown navigation.

V46 updates:
- MELI Stroke: centered the Upload Data block to match the other MELI pages.
- MELI Alz: renamed 'Upload ảnh não' to 'Upload dữ liệu'.

V47 updates:
- MELI Stroke: fixed the two final result columns to the same 600px height.
- Left-side Explanation/Lifestyle blocks split that height evenly.
- Any overflow now scrolls internally instead of changing the block height.

V48 updates:
- Fixed the missing application dropdown on MELIOR.
- Redesigned all application dropdowns with one consistent compact visual style.
- Every page now uses the same requested app list: MELIOR, MELIOCR, MELIVoice, MELIGuide, MELIVLM, MELICDSS, MELIDx, MELIPosOpt.
- The current app is omitted from its own dropdown.

V49 updates:
- Removed all duplicate/legacy application dropdowns across every HTML page.
- MELIDx and MELIVLM now show exactly one Home control and one polished dropdown.
- MELIOR, OCR, Voice, Stroke, Cardio, Alz, Diabetes, Mind, PosOpt/PostOp, VLM, Dx and the landing page were rechecked for duplicate navigation controls.
- Every page now has exactly one V48 dropdown; non-landing pages have at most one Home button.

V50 updates:
- MELICARE landing card links corrected:
  MELIOR -> MELI_OR.html
  MELIOCR -> MELI_OCR.html
  MELIVoice -> MELI_Voice.html
  MELIVLM -> MELI_VLM.html
  MELICDSS -> https://cdss.leira.com.vn
  MELIDx -> MELIDx.html
  MELIPostOp -> MELIPosOpt.html

V51 updates:
- Fixed the MELIPostOp card on MELICARE to navigate to MELIPostOp.html.

V52 cleanup:
- Removed duplicate MELIPosOpt.html.
- Kept MELIPostOp.html as the single canonical post-operative page.
- Updated all card/dropdown/internal links from MELIPosOpt.html to MELIPostOp.html.
- Normalized visible dropdown label to MELIPostOp.
- Verified that all local HTML links resolve and JavaScript syntax passes.

V53 updates:
- MELIPostOp: centered the Upload Data block vertically and horizontally within the input section.

V54 updates:
- MELI Stroke recommendation cards now clamp long descriptions to 2 lines.
- Added [more]/[less] toggle for full text.
- Hovering a recommendation card temporarily reveals the full description.
- Prevented recommendation text from overflowing into neighboring cards.

V55 updates:
- MELI Stroke lower area widened to a 50/50 split.
- Recommendation cards now use one item per row for better readability.
- Added more internal spacing to Explanation and Recommendation cards while retaining scroll behavior.

V56 updates:
- MELI Stroke: fixed clipping of the eyebrow/title area in the Explanation and Recommendation panels.
- Increased panel header height/padding so top text is fully visible.

V57 updates:
- Fixed MELI VLM runtime initialization after the navigation cleanup.
- +Ảnh now opens the upload picker.
- Tạo báo cáo now creates a report block.
- Send button and Enter-to-send work again.
- Xem ảnh selects/focuses the image viewer.
- Report edit/export buttons are functional.

V58 updates:
- MELI Stroke: increased spacing and height in the threshold cards.
- Separated indicator/value from status/delta more clearly.
- Added more room around the threshold bar and labels.

V59 updates:
- MELI Cardio: aligned Risk Assessment, Lifestyle & Follow-up, and Explanation to exactly the same 360px height.
- Long content now scrolls inside each block instead of making one column taller.

V61 stability cleanup:
- Rebuilt from the last stable v59 bundle because the aggressive v60 cleanup altered page behavior.
- Kept the original page/CSS structure intact.
- Removed only clearly obsolete navigation CSS/JS.
- Added a null-safe legacy switcher guard to MEDIStroke.
- Verified exactly one canonical dropdown on every HTML page.
- Verified zero duplicate DOM IDs.
- Verified zero broken local links.
- Verified JavaScript syntax on every page.

V62 dropdown rebuild:
- Rebuilt application navigation from scratch on every page.
- Removed all legacy/previous dropdown DOM, CSS, and JS.
- Added exactly one body-level fixed dropdown per page, so it cannot be clipped by parent containers.
- Current app is omitted from its own menu.
- Verified menu items, local links, and JavaScript syntax.

V63 updates:
- Added a Home button with a house icon beside the application dropdown on all non-landing pages.
- Home links back to MELICARE.html.
- Verified exactly one dropdown and one Home button per non-landing page.

V64 updates:
- MELIOR: fixed overlap between Home and application dropdown controls.
- Added explicit spacing/positioning for desktop and compact responsive behavior for smaller screens.

V65 updates:
- Removed redundant MEDIStroke.html; MELIStroke.html is now the only Stroke page.
- Added local login pages: MELICDSS_Login.html and MELIGuide_Login.html.
- Updated MELICDSS and MELIGuide card/dropdown links to open the new local login pages first.
- Login submit redirects to the corresponding live service.
- Verified zero broken local links and JavaScript syntax across the bundle.

V66 updates:
- Fixed MELICDSS and MELIGuide login-page navigation.
- Removed the oversized custom dropdown from login pages.
- Reused the same compact Home + dropdown controls as the rest of MELICARE.
- Current app is omitted from its own dropdown.

V67 updates:
- Added a Login button to MELICARE.
- Clicking Login opens a modal login screen.
- After login, the Login button is replaced by the logged-in user's name.
- Login state is stored in localStorage for the current browser.

V68 updates:
- MELICARE: grouped the application dropdown and auth control into one fixed right-side control row.
- Login/user button now sits at the far right, immediately beside the dropdown.
- Logged-in users are shown with a compact display name.

V69 updates:
- Added shared Login/User control to every subpage.
- Login button sits immediately to the left of the application dropdown.
- When logged in, the control becomes a user-icon button; clicking it shows user info + logout.
- Login opens a shared MELICARE popup and uses the same localStorage state across all pages.
- Added standalone MELICARE_Login.html as a dedicated login page/fallback.

V70 updates:
- Rebuilt the top-right controls layout on all pages using one shared flex container.
- Home, Login/User, and application dropdown now live in the same fixed row and cannot overlap.
- Order on subpages: Home | Login/User | App dropdown.
- MELICARE landing: Login/User | App dropdown.
- Added responsive compact behavior on narrower screens.

V71 updates:
- MELIOR: moved Home/Login/App-switch controls into MELIOR's native horizontal header instead of overlaying it.
- Removed the right-side footer chip from the MELIOR top bar to free space.
- Added compact breakpoints so controls no longer collide with MELIOR's menu/brand.
