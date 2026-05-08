# Mimi Mind Map Infinite Canvas Product Documentation

Version target: the current frontend application in this repository  
Audience: teachers, students, presenters, content creators, and users who need to organize lessons, activities, or presentations on an infinite canvas

## 1. Documentation, README, And User Manuals

For this project, it is useful to separate three kinds of documentation:

| Type | Primary readers | Main question answered | Recommended location |
| --- | --- | --- | --- |
| README | Developers, reviewers, deployers | What is this project? How do I install, run, and test it? | `README.md` |
| Product Documentation | End users, course reviewers, presenters | How do I create my first board? How do I use each feature? | `docs/product-documentation.md` |
| Developer Guide | Secondary developers | How do I extend components, plugins, history, serialization, and tests? | `AGENTS.md`, `docs/developer-guide.md`, or a README section |

“Create your first project” and “How to use each feature” can both live in one product documentation file. A natural structure is to start with a complete first-project workflow, then provide feature-by-feature reference sections.

## 2. Product Overview

Mimi is an infinite-canvas visual organization and presentation tool. Users can create pages, text blocks, sticky notes, images, embedded web pages, JavaScript runners, local videos, ranking activities, and shapes. These elements can then be organized with an outline, connections, jump buttons, presentation navigation, and page comparison.

Mimi is suitable for:

- Building lesson canvases and classroom activity materials
- Creating non-linear presentations
- Organizing mind maps, concept maps, workflows, and resource navigation spaces
- Combining web pages, images, videos, code, and explanatory text in one board
- Presenting a read-only view to an audience or sharing a live board through an online room

Core capabilities:

- Infinite canvas with pan, zoom, and overview navigation
- Edit and Present modes for creation and delivery
- Components including Page, Button, Text, Sticky Note, Image, Iframe, Ranking Box, JS Code Runner, and Local Video
- Shapes and connections for concept mapping and navigation
- Local JSON save/load and single-file HTML export
- Teaching helpers including pens, highlighter, eraser, page comparison, timer, binary calculator, attachments, bookmarks, and branch collapse

## 3. Quick Start: Create Your First Presentation Board

### 3.1 Open The App

In a local development environment, run the following from the repository root:

```bash
pnpm install
pnpm dev
```

Then open:

```text
http://localhost:3000
```

If you are using the product as an end user, open the deployed web app or an exported single-file HTML document.

### 3.2 Create Your First Page

1. Stay in `Edit` mode.
2. Click `Components` in the left toolbar.
3. Choose `Page`. A page will be added near the center of the current view. You can also drag a component onto a specific canvas position.
4. Select the Page to adjust its background, text style, attachments, and layer order through the contextual toolbar.

A Page works like a slide. Components placed on a Page can move with that Page, which makes it useful for grouping one lesson section, activity step, or presentation unit.

### 3.3 Add Content Components

From `Components`, add:

- `Text` for titles, instructions, questions, and explanations
- `Sticky Note` for prompts, discussion notes, and temporary reminders
- `Image` for uploaded visual materials
- `Iframe` for embedded web pages
- `JS Code Runner` for JavaScript examples
- `Local Video` for local video playback
- `Ranking Box` for sorting activities
- `Button` for presentation jumps

Double-click editable components to edit their content, or select them and use the related floating toolbar.

### 3.4 Add Jumps And Connections

1. Select the component that should start the relationship.
2. Use the relevant `Connect to` action to connect it to a target component.
3. For `Button` components, the connected target becomes the destination when the button is clicked in `Present` mode.

Buttons are one-way jumps. To create a two-way jump between two pages, create one button on each page and point each button to the other page.

### 3.5 Build The Outline

The right-side `Outline` panel turns a freeform canvas into a structured navigation list:

1. Select one or more components.
2. Click `Add selected`, or drag selected components into the outline.
3. Click an outline item to center the viewport on its canvas component.
4. Drag items or use direction controls to adjust hierarchy and order.
5. Double-click an outline item to rename it. The change syncs to the related canvas component.
6. Collapse an outline branch to hide its child components on the canvas.

### 3.6 Switch To Present Mode

When editing is complete, switch to `Present`:

- Editing panels collapse to maximize the board area
- Move the mouse to the top area to reveal presentation controls
- Show or hide all drawing strokes
- Enter fullscreen presentation
- Use page-edge navigation buttons when a Page is enlarged
- Use connection-edge jump controls to follow relationships between components

## 4. Interface Overview

| Area | Purpose |
| --- | --- |
| Left toolbar | Switch between Cursor, Brush tools, Eraser, Shapes, and Components; open Timer, Binary Calculator, Style, and fit-all controls |
| Top toolbar | Project title, save/load/share, Edit/Present mode switch, and contextual controls |
| Infinite canvas | Create, move, resize, connect, and present all content |
| Right Outline | Manage navigation structure, hierarchy, order, renaming, and branch collapse |
| Overview | Bottom-right minimap for global location and unlinked-page warnings |
| Floating panels | Contextual controls for selected components, attachments, connections, video, code, and styles |

## 5. Modes

### 5.1 Edit Mode

Edit mode is for creating and organizing content. In this mode you can:

- Create, move, resize, and rotate components
- Single-select, multi-select, and marquee-select content
- Edit text, sticky notes, buttons, pages, and shape styles
- Use pens, highlighter, annotation, and eraser
- Create component connections
- Add items to the outline and adjust the outline hierarchy
- Save, load, export, and share

Common selection interactions:

- Click a component: single select
- `Ctrl`/`Cmd` + click: multi-select
- `Shift` + drag empty canvas: marquee select
- Drag selected content: move components
- Drag empty canvas: pan the board

### 5.2 Present Mode

Present mode is for delivery and navigation:

- Editing panels are hidden or collapsed
- Users can pan and zoom the board
- Buttons, page-edge controls, and connection-edge controls can jump between content
- Drawing strokes can be shown or hidden
- Page Compare is available
- Online room viewers are restricted to read-only viewing

## 6. Toolbar Features

### 6.1 Cursor

Cursor is used to select, move, and arrange content:

- Click to select components
- Drag to move components
- Move multiple selected components together
- Drag empty canvas to pan the viewport

### 6.2 Brush Tools

Brush tools include:

- Pen: standard drawing
- Pencil: a rougher hand-drawn stroke
- Highlighter: translucent highlighting

Each brush type has preset colors, widths, and opacity. These tools are useful for classroom explanation, live annotation, emphasis, and presentation notes.

### 6.3 Eraser

Eraser removes whole drawing strokes rather than small stroke fragments. You can adjust the eraser size and clear all drawing strokes.

### 6.4 Shapes

Shapes can create:

- Rectangle
- Circle
- Diamond
- Triangle

Shapes support:

- Text editing
- Font size and text color changes
- Fill color, opacity, stroke color, and stroke width changes
- Layer ordering
- Connections to other components

### 6.5 Components

Components is the main entry point for content creation. Click it to open the component list, then click or drag a component to create it.

## 7. Components

### 7.1 Page

Page is the basic presentation surface. It can be understood as a slide or content container.

Common uses:

- One lesson slide
- One discussion prompt
- One activity step
- One group of related resources

Supported features:

- Background and style editing
- Child text, shapes, images, and other components
- Attachments or folders
- Connections to other components
- Layer ordering
- Presentation navigation target

### 7.2 Button

Button is a jump control for non-linear presentations.

Supported features:

- Button text editing
- Shape, fill, border, opacity, and text style changes
- Connection to a target component
- Visual target indication in Edit mode
- Click-to-jump behavior in Present mode

Note: Button jumps are one-way. For two-way navigation, create two buttons and point them at each other’s destinations.

### 7.3 Text

Text is the basic text box for titles, explanations, questions, and notes.

Supported features:

- Text editing
- Font size, color, and basic style changes
- Resize and reposition
- Layer ordering
- Outline and connection participation

### 7.4 Sticky Note

Sticky Note is a text block with a colored background. It is useful for:

- Classroom prompts
- Temporary ideas
- Group discussion notes
- Important reminders

It supports font, text color, background color, size, and layer adjustments.

### 7.5 Image

Image uploads an image file. Common browser-supported image formats such as PNG, JPG, WebP, and GIF can be used.

Supported features:

- Upload or replace an image
- Resize and reposition
- Connect to other components
- Adjust layer order
- Save image data inline with exported documents

### 7.6 Iframe

Iframe embeds a web URL inside the canvas.

Supported features:

- URL entry
- Web page display inside the component frame
- Interaction/display state switching: interaction mode lets users operate the embedded page, while display mode is better for arranging the board
- Connections to other components

Limitation: some websites block embedding through their own security policies. In that case, use an attachment link or a regular text link instead.

### 7.7 Ranking Box

Ranking Box supports sorting activities. It is useful for:

- Ordering process steps
- Ranking ideas by priority
- Rearranging workflow stages

Text items can be placed into a Ranking Box for ordering. Once placed, those items mainly behave as sortable entries rather than normal editable text boxes.

### 7.8 JS Code Runner

JS Code Runner is used to write and run JavaScript examples.

Main areas:

- Code: JavaScript input
- Preview: visual or rendered output
- Console: logs and error messages

Common actions:

- Run: execute the code
- Clear: clear output
- Resize the component to get more room for code or preview

It is useful for programming teaching, algorithm demonstrations, classroom experiments, and interactive examples.

### 7.9 Local Video

Local Video imports and plays a local video file.

It supports common browser video player capabilities:

- Play/pause
- Volume control
- Fullscreen
- Playback speed
- Picture-in-picture
- Download or browser-native controls

Video data can be saved inline with the document, making it available after export.

## 8. Outline

Outline is the right-side panel that turns a freeform board into structured navigation.

It helps users:

- See the key objects on a large board
- Jump quickly between important content
- Represent parent-child hierarchy
- Collapse branches to simplify the canvas

Common actions:

- Select components and click `Add selected`
- Drag outline items to change order or hierarchy
- Use direction controls for fine adjustments
- Double-click an item to rename it
- Click an item to center the view on the related canvas component
- Collapse a branch to hide its child components on the canvas

The top-right count shows how many items are currently in the outline.

## 9. Connections And Navigation

Connections represent relationships between components. They can also act as presentation navigation paths.

Common uses:

- Show ordering between pages
- Show conceptual cause, dependency, or flow
- Connect a button to its jump target
- Move along a relationship path in Present mode

Recommendations:

- Use connections to express content relationships
- Use Button for explicit audience-click jumps
- Give important Pages connections when possible, because Overview can warn about Pages with no connection target

## 10. Attachments And Bookmarks

Attachment-aware components, especially Page, can store URLs, individual files, or folders.

Useful scenarios:

- Add references to a lesson page
- Attach a resource pack to an activity page
- Add external links to a presentation page
- Open related materials as bookmarks in Present mode

In Present mode, Page attachments appear as bookmark-style entries. Click a bookmark to open the related content. Individual attachments can be removed.

## 11. Overview Minimap

The bottom-right `Overview` panel is the board minimap.

It can:

- Show the current viewport inside the full board
- Move the viewport when clicked
- Show a locating marker for selected components
- Collapse or expand the minimap
- Warn about Pages without connection targets and cycle through them

The fit-all control from the left toolbar is also attached to the Overview header, making it easy to fit all board content into view.

## 12. Page Compare

Page Compare lets users compare two Pages side by side in Present mode.

How to use:

1. Switch to `Present`.
2. Click one Page.
3. Hold `Shift` and click another Page.
4. Open the comparison window.

The comparison window supports:

- Side-by-side Page viewing
- Swapping left and right Pages
- Independent Page zooming
- Fit-to-window reset
- Fullscreen display
- `Esc` to close

It is useful for comparing two solutions, before/after states, student outputs, experiment results, or alternative plans.

## 13. Save, Load, And Export

### 13.1 JSON Save

JSON is the structured document format for continued editing.

Saved data includes:

- All components
- Component position, size, style, and content
- Pages, outline data, connections, attachments, annotations, and drawings
- Current viewport position and zoom

### 13.2 JSON Load

Loading JSON replaces the current board. The app asks for confirmation if the current board already has content.

After loading, the loaded document becomes the new undo/redo baseline so old history does not affect the new document.

### 13.3 Single-File HTML Export

HTML export creates a standalone file that can be opened in a browser. It is suitable for:

- Assignment or project submission
- Offline presentation
- Sharing with people who do not have a development environment
- Preserving the current board snapshot

Note: local `file://` HTML exports hide the Share button because a local file cannot reliably use the online room service.

## 14. Online Room Sharing

Online sharing lets a host create a four-digit room link such as `/room/1234`. Viewers open the link and enter viewer mode.

Hosts can:

- Create a room
- Set an optional password
- Get a share link and QR code
- Edit the board and broadcast state to viewers
- Broadcast their viewport

Viewers can:

- Join through the link
- Enter a password for protected rooms
- Follow the host camera
- Switch to free viewer camera
- Save a JSON or HTML copy

Viewers cannot:

- Enter Edit mode
- Modify board content
- Load a document that replaces the host state

If a viewer pans or zooms while following the host, the app automatically switches them to free viewer camera mode.

## 15. Teaching Helpers

### 15.1 Timer

Timer/Stopwatch can be used for timed classroom activities, countdowns, or pacing a presentation. It supports start, pause, reset, and minute/second duration inputs.

### 15.2 Binary Calculator

Binary Calculator is a floating calculator for binary calculations and computer science teaching.

### 15.3 Background Style

The Style panel adjusts the board background:

- Default / Colorful themes
- Blank / Grid / Dot background types
- Preset background colors
- Custom background color
- Background opacity

## 16. Common Shortcuts

| Shortcut | Function |
| --- | --- |
| `Mod+Z` | Undo |
| `Mod+Shift+Z` | Redo |
| `Mod+Y` | Redo |
| `Mod+S` | Open save/export menu |
| `Mod+O` | Load document |
| `Delete` / `Backspace` | Delete selected components |
| `Shift` + drag | Marquee select |
| `Ctrl` / `Cmd` + click | Multi-select |
| `Esc` | Close selected overlays or leave some presentation-related interfaces |
| `Home` | Fit all content to the viewport |

`Mod` usually means `Ctrl` on Windows/Linux and `Cmd` on macOS.

## 17. Recommended Workflows

### 17.1 Build A Lesson Presentation

1. Use Pages to divide lesson sections.
2. Add Text, Sticky Note, Image, and Video content.
3. Use Buttons for non-linear jumps.
4. Use connections to show page relationships.
5. Add key Pages to the Outline.
6. Test navigation in Present mode.
7. Export HTML for offline delivery or JSON for continued editing.

### 17.2 Build A Classroom Ranking Activity

1. Create a Page for the activity instructions.
2. Add Text for the task prompt.
3. Add multiple Text items as sortable entries.
4. Add a Ranking Box.
5. Let students place text entries into the Ranking Box.
6. Use Page Compare to compare different ranking results.

### 17.3 Build A Programming Teaching Example

1. Create a Page.
2. Add Text to explain the concept.
3. Add a JS Code Runner.
4. Enter example code in the code area.
5. Run the code and inspect Preview or Console output.
6. Use brush tools to annotate key outputs or error locations.

## 18. FAQ

### Why can’t some websites display inside an Iframe?

Some websites block embedding through their own security headers. In that case, add the URL as an attachment or regular text link.

### Why does an exported local HTML file not show the Share button?

Local `file://` files cannot reliably use the online room service, so Share is hidden. Use the deployed web version for online sharing.

### Should I export JSON or HTML?

- Choose JSON if you want to keep editing.
- Choose HTML if you want an offline browser-openable file.
- Keep both if you want a maintainable source document and a shareable deliverable.

### Can I edit in Present mode?

Present mode is mainly for delivery. Editing controls are hidden or disabled. Switch back to Edit mode to modify content.

### Why does a Button only jump one way?

A Button represents a one-way jump. For two-way navigation, create two Buttons and point them at each other’s destinations.

## 19. Developer Appendix

If readers need to start the project from scratch, use the minimum workflow below.

### 19.1 Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm `10.23.0`

### 19.2 Local Development

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:3000
```

### 19.3 Room Relay Server

```bash
pnpm server
```

The frontend’s default room backend host is `au.baitian.moe:3001`. Tests may override it with `window.__ROOM_BACKEND_HOST__`.

### 19.4 Build And Test

```bash
pnpm build
pnpm test:unit
pnpm test:e2e
pnpm test
```

Before the first Playwright E2E run on a new machine, you may need:

```bash
pnpm exec playwright install chromium
```

### 19.5 Secondary Development Notes

- New components should live under `src/component/`
- Components own their creation, serialization, and restoration logic
- Behaviors should live under `src/plugins/`
- Reversible changes should emit `node:change:start` and `node:changed`
- New components should have at least one undo/redo or document-load roundtrip test
- Normal frontend feature work should not change `server/` unless backend changes are explicitly required

