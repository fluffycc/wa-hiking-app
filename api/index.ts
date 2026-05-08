// Entry point for Azure Functions v4 runtime.
// Explicitly import every function file so they all register with app.http().
// This is more reliable than a glob pattern in package.json "main".

import './feedback/index'
import './trail/index'
import './trails/index'
import './src/functions/conditions'
import './src/functions/osm'
import './src/functions/wadnr'
import './src/functions/waparks'
import './src/functions/wta'
