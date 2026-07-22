# Edit the playable Demo in Studio

The Demo is an ordinary ASHA project. Studio and the game both open the root
`asha.project-bundle.json`; there is no separate runtime scene or bootstrap
fixture to keep synchronized.

## Open and inspect

Build the Demo's composed provider first:

```bash
cd /home/dev/asha-demo
npm run build:native-provider
```

Then start Studio's native host and trusted host-file service from the sibling
`asha-studio` checkout. The trusted host selects the provider; project JSON and
LAN browsers cannot choose a native module:

```bash
cd /home/dev/asha-studio
ASHA_STUDIO_NATIVE_PROVIDER_PATH=/home/dev/asha-demo/dist/native/asha-demo-runtime-provider.node pnpm run studio:lan
```

Open `http://127.0.0.1:4200/?project=/home/dev/asha-demo`, or use **Project >
Open Project** and select `/home/dev/asha-demo/asha.game.toml`. Studio's file
dialogs always refer to files on the computer running Studio, including when
the browser is on another LAN machine.

Open **Project Content**. The browser shows the manifest-authorized scene,
stored voxel asset, actor definitions, prefab registry, material/presentation
catalogs, and the typed `demo.primary-fire-effect` and `demo.launch-settings`
configurations. Select the
Generated tunnel room and choose **Open Stored Scene**. The hierarchy and
viewport should show the stored tunnel environment, player/enemy placements,
challenge trigger, blue/red console prefab instances, and the two scene lights.

Use the relationship links in Project Content to move between a scene instance,
its entity or prefab definition, material/presentation resources, gameplay
binding, and configuration. Runtime numeric entity/prefab ids are not project
identities and are not authored here.

## Make and save representative changes

- Select **Directional Light** or **Point Light** to change its transform,
  color, or intensity in the inspector.
- Select **Player start** or **Enemy start** and move the marker. The actor
  instance refers to that stored marker, so a fresh runtime uses the new pose.
- Use the Voxel tools to edit the loaded `generated-tunnel` asset. Accept the
  edit and use the normal voxel save action; the scene keeps only the asset
  reference and placement transform.
- In **Project Content**, select the gameplay configuration document and edit a
  provider-described field such as `objectivePoints` or
  `closeRangeMillimeters`. Use **Save Accepted Change**.
- In that same document, select `demo.launch-settings.default`. Its fields
  choose the player EntityDefinition and control camera projection, grounded
  versus free-flight movement, camera collision extents, and solver iterations.
  Change `fovYDegrees` and use **Save Accepted Change** to exercise the complete
  typed launch-settings path.
- Select the material catalog, then edit the bounded color, roughness, or
  emission fields under **Typed Stored Fields**. The accepted edit updates the
  voxel material in the viewport without replacing the voxel asset. A voxel
  palette's **Open material** action navigates back to the same catalog entry.
- Select the presentation catalog to inspect and edit sampled animation time,
  audio gain, or particle scale. The GLB, WAV, and SVG are ordinary
  manifest-closed resources under `assets/`; Studio edits typed references and
  cue metadata rather than embedding bytes or a raw JSON proof panel.

Use **File > Save Scene** for scene changes. Studio validates changes through
Rust and updates the canonical project write set; do not hand-edit content
hashes. If Studio reports that a host file changed, choose reload, overwrite, or
cancel explicitly rather than discarding either version silently.

Close/reopen the scene or use **Reload from Disk** in Project Content before
running the game. This confirms that the visible result came back from stored
files rather than an editor preview.

## Run the result

From the Demo checkout:

```bash
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173`. A fresh RuntimeSession loads the same canonical
project closure. Geometry, lights, actor spawn poses, prefab variants, typed
gameplay configuration, materials, presentation resources, and
camera/controller settings therefore come from the state inspected in Studio.
The transient camera starts at the Rust-materialized
transform for the EntityDefinition selected by `playerEntityDefinition`; the
browser host does not keep a second spawn or projection literal.
Normal play, death/restart, and pause never write to project files.

Continue editing by reopening the project normally. Before saving, use Studio's
undo/history controls to abandon an unwanted edit; after saving, restore a prior
file revision through the project's ordinary version-control workflow and use
**Reload from Disk**. No Demo-specific reset or proof workflow is required.
