--[[
  MAIDR — accessible Observable Plot charts in Quarto documents.

  Adds MAIDR's runtime and its Observable Plot adapter to an HTML document, so
  every chart an `{ojs}` cell draws with Plot becomes navigable by keyboard,
  sonifiable, and readable as text or braille.

  The adapter watches the page rather than being called, which is what makes
  this a filter and not an API: an `{ojs}` cell's value *is* the chart, so
  there is nowhere in the cell for a binding call to go. Loading the two
  scripts is the whole integration, and cells that redraw when a reader moves
  a `viewof` input are picked up as they redraw.

  Usage, in a document's YAML header or in `_quarto.yml`:

      filters:
        - maidr

  Options:

      maidr-version: "4.2.0"   # which release to load; defaults to the latest
      maidr-base-url: "/js"    # serve the bundles yourself instead of via CDN
]]

local DEFAULT_BASE_URL = 'https://cdn.jsdelivr.net/npm/maidr'

--- Reads a metadata value as a plain string.
-- @param value the metadata value, or nil when the option is absent
-- @return the string, or nil when the option is absent or empty
local function as_string(value)
  if value == nil then
    return nil
  end
  local text = pandoc.utils.stringify(value)
  if text == '' then
    return nil
  end
  return text
end

--- Builds the base URL the bundles are loaded from.
-- `maidr-base-url` wins when it is set, so a project can serve the files
-- itself; otherwise the jsDelivr package is used, pinned to `maidr-version`
-- when one is given.
-- @param meta the document metadata
-- @return the base URL, without a trailing slash
local function base_url(meta)
  local explicit = as_string(meta['maidr-base-url'])
  if explicit ~= nil then
    return (explicit:gsub('/+$', ''))
  end

  local version = as_string(meta['maidr-version'])
  if version == nil then
    return DEFAULT_BASE_URL .. '/dist'
  end
  return DEFAULT_BASE_URL .. '@' .. version .. '/dist'
end

--- Renders a script tag.
-- @param url the script's URL
-- @return the tag as raw HTML
local function script_tag(url)
  return '<script src="' .. url .. '"></script>'
end

--- Injects the runtime and the adapter into the document head.
-- Only HTML formats get them: the scripts do nothing in a PDF or a Word
-- document, and Quarto only runs OJS cells for HTML in the first place.
-- @param meta the document metadata
-- @return nil, leaving the metadata unchanged
function Meta(meta)
  if not quarto.doc.is_format('html:js') then
    return nil
  end

  local base = base_url(meta)
  quarto.doc.include_text('in-header', table.concat({
    script_tag(base .. '/maidr.js'),
    script_tag(base .. '/observable.js'),
  }, '\n'))

  return nil
end
