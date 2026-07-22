# IntelliGRC Official API Documentation

Local archive of the authenticated IntelliGRC API documentation.

## Contents

- `index.html` — documentation entry point
- `swagger/v1/swagger.json` — authoritative OpenAPI specification
- `redoc.standalone.js` — bundled Redoc renderer
- `index.js` and `index.css` — documentation site assets

## View locally

From this directory, run:

```sh
python3 -m http.server 8080
```

Then open <http://127.0.0.1:8080/index.html>.

The copied specification describes the API as it existed when this archive was created.
