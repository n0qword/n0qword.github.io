# bitácora

Blog minimalista sobre seguridad ofensiva, con estética red/black estilo terminal.

**Stack:** [Astro](https://astro.build) 5 + Content Collections + JavaScript vanilla. Sin frameworks de frontend.

---

## Requisitos

- Node.js >= 18
- [pnpm](https://pnpm.io/installation)

## Comandos

| Comando | Acción |
|---------|--------|
| `pnpm install` | Instalar dependencias |
| `pnpm dev` | Iniciar servidor de desarrollo (http://localhost:4321) |
| `pnpm build` | Generar sitio estático en `dist/` |
| `pnpm preview` | Previsualizar build localmente |

---

## Estructura del proyecto

```
src/
├── data/
│   └── home.md              ← Configuración del sitio (nombre, desc, redes)
├── content/
│   ├── config.ts             ← Schema de content collections
│   └── blog/                 ← Posts en Markdown (*.md)
│       ├── kerberoasting.md
│       ├── amsi-patching.md
│       └── dcsync-rust.md
├── scripts/
│   └── filters.js            ← JS compartido: búsqueda + filtro por tags
├── layouts/
│   └── Layout.astro          ← Layout base (HTML shell + CSS global)
├── pages/
│   ├── index.astro           ← Home (/)
│   ├── 404.astro             ← Página 404
│   ├── posts/
│   │   └── index.astro       ← Archivo de posts (/posts/)
│   ├── blog/
│   │   └── [...slug].astro   ← Página individual de post (/blog/:slug/)
│   └── rss.xml.js            ← Feed RSS (/rss.xml)
public/
└── favicon.svg
```

---

## Cómo publicar un post

### 1. Crear el archivo

Dentro de `src/content/blog/` creá un archivo Markdown con el nombre que quieras (el slug se genera automáticamente del nombre del archivo).

```bash
src/content/blog/mi-post.md
```

### 2. Frontmatter (obligatorio)

Cada post necesita un bloque YAML al inicio. Los campos son:

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `title` | string | sí | Título del post. Aparece en la home, el archivo y la página del post. |
| `description` | string | sí | Resumen de 1-2 líneas. Se muestra como excerpt en las listas. |
| `pubDate` | date | sí | Fecha en formato `YYYY-MM-DD`. Los posts se ordenan de más reciente a más antiguo. |
| `tags` | array | no | Lista de strings para categorizar el post. Se usan para filtrar en la home y en /posts/. |

Ejemplo:

```yaml
---
title: "Kerberoasting Internals — From TGS-REQ to Offline Crack"
description: "A low-level dissection of the Kerberos TGS exchange."
pubDate: 2025-01-15
tags: [kerberos, active-directory, credential-access]
---
```

### 3. Body

El contenido del post se escribe en Markdown estándar después del frontmatter. Se renderiza automáticamente en `/blog/:slug/`.

### 4. Build

```bash
pnpm build
```

El post aparece en la home (hasta 3), en `/posts/` y en el feed RSS.

### 5. Tags existentes

| Tag | Cuándo usarlo |
|-----|---------------|
| `kerberos` | Protocolo Kerberos, TGT, TGS, AS-REP |
| `active-directory` | Active Directory, LDAP, AD internals |
| `credential-access` | Técnicas de acceso a credenciales (Kerberoasting, DCSync) |
| `dcsync` | DCSync, MS-DRSR, DRSUAPI |
| `ms-drsr` | Replication protocol, DRSUAPI internals |
| `rust` | Implementaciones en Rust |
| `amsi` | Antimalware Scan Interface, AMSI bypass |
| `edr-evasion` | Evasión de EDR, técnicas de opsec |
| `windows-internals` | Windows interno, kernel, CLR, ETW |
| `memory-patching` | Parches en memoria, hooks, VirtualProtect |

---

## Configuración del sitio

Todo se configura desde un solo archivo:

**`src/data/home.md`**

```yaml
---
name: bitácora           # Nombre del sitio (header, title, copyright)
description: "..."       # Meta description + RSS
url: "https://..."       # URL base (necesaria para RSS)
lang: es                 # Idioma del <html>
author: z4d3s            # Autor (copyright)
github: https://...      # Link social
twitter: https://...     # Link social
mail: user@domain.xyz    # Link de contacto
---
```

El body del archivo es la biografía que aparece en el hero de la home.

---

## Personalización

### Colores

Las variables CSS están definidas en `:root` dentro de `src/layouts/Layout.astro`. Para cambiar el tema, modificá los valores de `--red`, `--bg`, `--fg`, etc.

### Tipografía

El proyecto usa tres familias de Google Fonts:
- **Barlow** — cuerpo de texto
- **Barlow Condensed** — títulos
- **IBM Plex Mono** — código, UI, etiquetas

Se cargan desde Google Fonts en el `<head>` del Layout.

---

## Deploy a GitHub Pages

### 1. Configurar `astro.config.mjs`

Según el tipo de sitio:

| Tipo | `site` | `base` |
|------|--------|--------|
| User site (`z4d3s.github.io`) | `https://z4d3s.github.io` | (dejar vacío) |
| Project site (`z4d3s.github.io/bitacora/`) | `https://z4d3s.github.io` | `"/bitacora"` |
| Dominio personalizado | `https://tudominio.com` | (dejar vacío) |

### 2. Subir a GitHub

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/TU_USER/TU_REPO.git
git push -u origin main
```

### 3. Habilitar Pages

1. Ir a repo **Settings → Pages → Source → GitHub Actions**
2. El workflow se ejecuta automáticamente al pushear a `main`
3. Una vez deployado, el sitio está en `https://<user>.github.io/<repo>/`

---

## Licencia

Sin licencia definida — uso personal.
