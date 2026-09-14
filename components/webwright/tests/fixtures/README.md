# Test fixtures

`toolkits/` mirrors the persistent root consumed by `ToolkitStore`. Each Toolkit fixture keeps its metadata, Tool metadata, version slots, and an empty runtime record in the same relative paths used at runtime. Tests copy the fixture root to a temporary directory before making changes.
