# Mimi Mind Map Infinite Canvas Product Documentation

Version target: the current frontend application in this repository  
Audience: teachers, students, presenters, content creators, and users who need to organize lessons, activities, or presentations on an infinite canvas

## 1. Product Overview

Mimi is an infinite-canvas visual organization and presentation tool. Users can create pages, text blocks, sticky notes, images, embedded web pages, JavaScript runners, local videos, ranking activities, and shapes. These elements can then be organized with an outline, connections, jump buttons, presentation navigation, and page comparison.

Mimi is suitable for:

- Building lesson canvases and classroom activity materials
- Creating non-linear presentations
- Organizing mind maps, concept maps, workflows, and resource navigation spaces
- Combining web pages, images, videos, code, and explanatory text in one board
- Presenting a read-only view to an audience or sharing a live board through an online room

Core capabilities:

- Infinite canvas with pan, zoom, and overview navigation
- Teacher-side modes: Edit for creating and organizing content, Present for maximizing delivery space
- Student-side views: Host follows the presenter camera, Viewer allows free panning and zooming
- Components including Page, Button, Text, Sticky Note, Image, Iframe, Ranking Box, JS Code Runner, and Local Video
- Shapes and connections for concept mapping and navigation
- Local JSON save/load and single-file HTML export
- Teaching helpers including pens, highlighter, eraser, page comparison, timer, binary calculator, attachments, bookmarks, and branch collapse

## 2. Quick Start: Create Your First Presentation Board

### 2.1 Open The App

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

### 2.2 Create Your First Page

1. Stay in `Edit` mode.
2. Click `Components` in the left toolbar.
3. Choose `Page`. A page will be added near the center of the current view. You can also drag a component onto a specific canvas position.
4. Select the Page to adjust its background, text style, attachments, and layer order through the contextual toolbar.

A Page works like a slide. Components placed on a Page can move with that Page, which makes it useful for grouping one lesson section, activity step, or presentation unit.

### 2.3 Add Content Components

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

### 2.4 Add Jumps And Connections

1. Select the component that should start the relationship.
2. Use the relevant `Connect to` action to connect it to a target component.
3. For `Button` components, the connected target becomes the destination when the button is clicked in `Present` mode.

Buttons are one-way jumps. To create a two-way jump between two pages, create one button on each page and point each button to the other page.

### 2.5 Build The Outline

The right-side `Outline` panel turns a freeform canvas into a structured navigation list:

1. Select one or more components.
2. Click `Add selected`, or drag selected components into the outline.
3. Click an outline item to center the viewport on its canvas component.
4. Drag items or use direction controls to adjust hierarchy and order.
5. Double-click an outline item to rename it. The change syncs to the related canvas component.
6. Collapse an outline branch to hide its child components on the canvas.

### 2.6 Switch To Present Mode

When editing is complete, switch to `Present`:

- Editing panels collapse to maximize the board area
- Move the mouse to the top area to reveal presentation controls
- Show or hide all drawing strokes
- Enter fullscreen presentation
- Use page-edge navigation buttons when a Page is enlarged
- Use connection-edge jump controls to follow relationships between components

## 3. Interface Overview

| Area | Purpose |
| --- | --- |
| Left toolbar | Switch between Cursor, Brush tools, Eraser, Shapes, and Components; open Timer, Binary Calculator, Style, and fit-all controls |
| Top toolbar | Project title, save/load/share, Edit/Present mode switch, and contextual controls |
| Infinite canvas | Create, move, resize, connect, and present all content |
| Right Outline | Manage navigation structure, hierarchy, order, renaming, and branch collapse |
| Overview | Bottom-right minimap for global location and unlinked-page warnings |
| Floating panels | Contextual controls for selected components, attachments, connections, video, code, and styles |

## 4. Modes

Mimi has teacher-side modes and student-side views. The teacher side controls content creation and delivery; the student side is used when viewing an online room.

### 4.1 Teacher Edit Mode

Edit mode is for creating and organizing content. Components, toolbars, the right Outline, and floating panels are fully available. In this mode you can:

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

### 4.2 Teacher Present Mode

Present mode is for delivery. Editing toolbars collapse, the canvas area is maximized, and the focus is on viewing, explaining, and navigating:

- Users can pan and zoom the board
- Buttons, page-edge controls, and connection-edge controls can jump between content
- Drawing strokes can be shown or hidden
- Page Compare is available
- Presentation-board fullscreen is available

### 4.3 Student Host View

When students join through an online room, they can follow the Host view. Host view follows the presenter's canvas position and zoom, which is useful for live teaching or synchronized presentation.

### 4.4 Student Viewer View

Viewer view lets students pan and zoom the canvas freely. If a student pans or zooms while following Host, the app automatically switches to Viewer view so their independent browsing is not overwritten by the presenter camera.

Students can view and save a copy, but they cannot enter Edit mode, modify the board, or load a document over the Host state.

## 5. Toolbar Features

### 5.1 Cursor

Cursor is used to select, move, and arrange content:

- Click to select components
- Drag to move components
- Move multiple selected components together
- Drag empty canvas to pan the viewport

### 5.2 Brush Tools

Brush tools include:

- Pen: standard drawing
- Pencil: a rougher hand-drawn stroke
- Highlighter: translucent highlighting

Each brush type has preset colors, widths, and opacity. These tools are useful for classroom explanation, live annotation, emphasis, and presentation notes.

### 5.3 Eraser

Eraser removes whole drawing strokes rather than small stroke fragments. You can adjust the eraser size and clear all drawing strokes.

### 5.4 Shapes

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

### 5.5 Components

Components is the main entry point for content creation. Click it to open the component list, then click or drag a component to create it.

## 6. Components

### 6.1 Page

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

### 6.2 Button

Button is a jump control for non-linear presentations.

Supported features:

- Button text editing
- Shape, fill, border, opacity, and text style changes
- Connection to a target component
- Visual target indication in Edit mode
- Click-to-jump behavior in Present mode

Note: Button jumps are one-way. For two-way navigation, create two buttons and point them at each other’s destinations.

### 6.3 Text

Text is the basic text box for titles, explanations, questions, and notes.

Supported features:

- Text editing
- Font size, color, and basic style changes
- Resize and reposition
- Layer ordering
- Outline and connection participation

### 6.4 Sticky Note

Sticky Note is a text block with a colored background. It is useful for:

- Classroom prompts
- Temporary ideas
- Group discussion notes
- Important reminders

It supports font, text color, background color, size, and layer adjustments.

### 6.5 Image

Image uploads an image file. Common browser-supported image formats such as PNG, JPG, WebP, and GIF can be used.

Supported features:

- Upload or replace an image
- Resize and reposition
- Connect to other components
- Adjust layer order
- Save image data inline with exported documents

### 6.6 Iframe

Iframe embeds a web URL inside the canvas.

Supported features:

- URL entry
- Web page display inside the component frame
- Interaction/display state switching: interaction mode lets users operate the embedded page, while display mode is better for arranging the board
- Connections to other components

Limitation: some websites block embedding through their own security policies. In that case, use an attachment link or a regular text link instead.

### 6.7 Ranking Box

Ranking Box supports sorting activities. It is useful for:

- Ordering process steps
- Ranking ideas by priority
- Rearranging workflow stages

Text items can be placed into a Ranking Box for ordering. Once placed, those items mainly behave as sortable entries rather than normal editable text boxes.

### 6.8 JS Code Runner

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

### 6.9 Local Video

Local Video imports and plays a local video file.

It supports common browser video player capabilities:

- Play/pause
- Volume control
- Fullscreen
- Playback speed
- Picture-in-picture
- Download or browser-native controls

Video data can be saved inline with the document, making it available after export.

## 7. Outline

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

## 8. Connections And Navigation

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

## 9. Attachments And Bookmarks

Attachment-aware components, especially Page, can store URLs, individual files, or folders.

Useful scenarios:

- Add references to a lesson page
- Attach a resource pack to an activity page
- Add external links to a presentation page
- Open related materials as bookmarks in Present mode

In Present mode, Page attachments appear as bookmark-style entries. Click a bookmark to open the related content. Individual attachments can be removed.

## 10. Overview Minimap

The bottom-right `Overview` panel is the board minimap.

It can:

- Show the current viewport inside the full board
- Move the viewport when clicked
- Show a locating marker for selected components
- Collapse or expand the minimap
- Warn about Pages without connection targets and cycle through them

The fit-all control from the left toolbar is also attached to the Overview header, making it easy to fit all board content into view.

## 11. Page Compare

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

## 12. Save, Load, And Export

### 12.1 JSON Save

JSON is the structured document format for continued editing.

Saved data includes:

- All components
- Component position, size, style, and content
- Pages, outline data, connections, attachments, annotations, and drawings
- Current viewport position and zoom

### 12.2 JSON Load

Loading JSON replaces the current board. The app asks for confirmation if the current board already has content.

After loading, the loaded document becomes the new undo/redo baseline so old history does not affect the new document.

### 12.3 Single-File HTML Export

HTML export creates a standalone file that can be opened in a browser. It is suitable for:

- Assignment or project submission
- Offline presentation
- Sharing with people who do not have a development environment
- Preserving the current board snapshot

Note: local `file://` HTML exports hide the Share button because a local file cannot reliably use the online room service.

## 13. Online Room Sharing

Online sharing lets a Host create a four-digit room link such as `/room/1234`. Students or audience members open the link and enter the Viewer side, where they can watch the Host board in read-only mode.

Teacher-side Hosts can:

- Create a room
- Set an optional password
- Get a share link and QR code
- Edit the board and broadcast state to viewers
- Broadcast their viewport

Student-side Viewers can:

- Join through the link
- Enter a password for protected rooms
- Follow the host camera
- Switch to free viewer camera
- Save a JSON or HTML copy

Student-side Viewers cannot:

- Enter Edit mode
- Modify board content
- Load a document that replaces the host state

If a student-side Viewer pans or zooms while following Host, the app automatically switches from Host view to free Viewer view.

## 14. Teaching Helpers

### 14.1 Timer

Timer/Stopwatch can be used for timed classroom activities, countdowns, or pacing a presentation. It supports start, pause, reset, and minute/second duration inputs. Press `Enter` in the minute or second input to finish editing that value.

### 14.2 Binary Calculator

Binary Calculator is a floating calculator for binary calculations, base-conversion teaching, and quick computer science demonstrations.

### 14.3 Overview / Minimap

Overview is the bottom-right minimap. It shows the current viewport, selected component location, page connection status, and supports clicking to move the camera.

### 14.4 Page Compare

Page Compare is used in Present mode to view two Pages side by side. Select one Page, hold `Shift`, and click another Page to open comparison. Press `Esc` to close it.

### 14.5 Background Style

The Style panel adjusts the board background:

- Default / Colorful themes
- Blank / Grid / Dot background types
- Preset background colors
- Custom background color
- Background opacity

## 15. Shortcuts

### 15.1 General Canvas And File Shortcuts

| Shortcut / Action | Function |
| --- | --- |
| Mouse wheel | Zoom the canvas |
| Middle-button drag | Pan the canvas |
| `Space` + drag | Pan the canvas |
| `Home` | Fit all content to the viewport |
| `Mod++` / `Mod+=` | Zoom in |
| `Mod+-` | Zoom out |
| `Mod+S` | Open save/export menu |
| `Mod+O` | Load a JSON document |
| `Esc` | Close the save menu, comparison window, selected overlays, or current tool panels |

### 15.2 Edit Mode Shortcuts

| Shortcut / Action | Function |
| --- | --- |
| Drag empty canvas | Pan the canvas while using the Arrange tool |
| `Mod` + click | Multi-select components |
| `Shift` + drag empty canvas | Marquee-select components |
| `Delete` / `Backspace` | Delete selected components |
| `Mod+C` | Copy selected components |
| `Mod+V` | Paste components |
| `Mod+Z` | Undo |
| `Mod+Shift+Z` / `Mod+Y` | Redo |
| `Enter` | Open the selected component's edit entry; migrated components usually use floating toolbars or inline editing |
| `Mod+Alt+A` | Add the selected node to the right Outline |
| Hold `Shift` while drawing with Shape | Constrain shape proportion or direction |

### 15.3 Present Mode Shortcuts

| Shortcut / Action | Function |
| --- | --- |
| `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` | Navigate by page or saved focus direction |
| `Esc` | Exit Present and return to Edit |
| `Mod+Shift+F` | Toggle presentation-board fullscreen |
| Move the mouse to the top area | Reveal the auto-hidden presentation toolbar |
| `Shift` + click another Page | Open Page Compare |

### 15.4 Student Viewer Restrictions

| Shortcut / Action | Function |
| --- | --- |
| `Mod+S` | Allowed: save/export the current viewed copy |
| `Mod+O` | Blocked: viewers cannot load a document over the host state |
| `Mod+Z` / `Mod+Y` | Blocked: viewers cannot undo or redo host state |
| Pan or zoom | If following Host, automatically switch to free Viewer camera |
| Click the `Host` / `Viewer` mode capsule | Switch between following the host and free viewing |

### 15.5 Right Outline Shortcuts

| Context | Shortcut / Action | Function |
| --- | --- | --- |
| Outline item focused | `Enter` / `Space` | Jump to and center the linked component |
| Outline item focused and editable | `ArrowUp` / `ArrowDown` | Reorder within the same level |
| Outline item focused and editable | `ArrowRight` | Indent under the previous sibling |
| Outline item focused and editable | `ArrowLeft` | Promote to the parent's level |
| Outline item focused and editable | `Delete` / `Backspace` | Remove the item from the Outline and promote its children |
| Renaming after double-click | `Enter` | Finish renaming |
| Renaming after double-click | `Esc` | Cancel renaming |
| Title text editing | Normal arrow keys | Move the text cursor |
| Title text editing | Double-tap `ArrowLeft` / `ArrowRight` | Finish editing and adjust outline hierarchy |

### 15.6 Left Component Area And Component Shortcuts

| Component / Area | Shortcut / Action | Function |
| --- | --- | --- |
| Components panel | Drag component to canvas | Create a component |
| Text / Sticky / Button / Shape text | `Mod+Enter` | Commit inline text editing |
| Text / Sticky / Button / Shape text | `Esc` | Cancel or close inline text editing |
| Iframe URL input | `Enter` | Apply the URL change |
| Iframe interaction mode | `Esc` | Exit webpage interaction mode |
| Iframe more-actions button | `Enter` / `Space` | Open or close the Iframe action menu |
| JS Code Runner | `Mod+Enter` | Run code |
| Component Editor modal | `Esc` | Close the modal |
| Connection creation | `Esc` | Cancel connection creation |
| Pen preset popup | `Esc` | Close pen presets |
| Eraser panel | `Esc` | Close the eraser panel |

## 16. Recommended Workflows

### 16.1 Build A Lesson Presentation

1. Use Pages to divide lesson sections.
2. Add Text, Sticky Note, Image, and Video content.
3. Use Buttons for non-linear jumps.
4. Use connections to show page relationships.
5. Add key Pages to the Outline.
6. Test navigation in Present mode.
7. Export HTML for offline delivery or JSON for continued editing.

### 16.2 Build A Classroom Ranking Activity

1. Create a Page for the activity instructions.
2. Add Text for the task prompt.
3. Add multiple Text items as sortable entries.
4. Add a Ranking Box.
5. Let students place text entries into the Ranking Box.
6. Use Page Compare to compare different ranking results.

### 16.3 Build A Programming Teaching Example

1. Create a Page.
2. Add Text to explain the concept.
3. Add a JS Code Runner.
4. Enter example code in the code area.
5. Run the code and inspect Preview or Console output.
6. Use brush tools to annotate key outputs or error locations.

## 17. FAQ

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

### What is the difference between student Host view and Viewer view?

Host view follows the presenter's canvas position and zoom, which is useful for synchronized teaching. Viewer view lets students browse the board freely. If a student pans or zooms while following Host, the app automatically switches to Viewer view.

### Why does a Button only jump one way?

A Button represents a one-way jump. For two-way navigation, create two Buttons and point them at each other’s destinations.
