import { parseTable } from '@joshuaavalon/cheerio-table-parser'

/**
 * A {@link Field} inside a HTML table to extract and parse. 
 */
export interface Field {
  input: string;    // Regex for the field name.
  output: string;   // Override the field name, defaults to input.
  parser: Function; // Callback to parse each value for the field.
}

/**
 * Parse an HTML table element into an array of objects. 
 * @param html The HTML element, from the 'cheerio' library.
 * @param fields List of fields to extract from the table.
 */
export function parse<T>(html: CheerioElement, ...fields: Field[]): Array<T> {
  const raw = parseTable(html)

  var names = raw.shift()
  if(names == null) {
    throw new Error(`Could not find column names for ${JSON.stringify(raw)}`)
  }
  names = names.map(name => name.replace(/[^A-Za-z]/g, '').toLowerCase().trim())

  const cols = names.map(name => fields.filter(field => name.match(field.input)))
  const res = new Array(raw.length)
  
  for(var i = 0; i < cols.length; i++) {
    const col = cols[i]
    if(col.length <= 0) continue

    for(var j = 0; j < raw.length; j++) {
      for(const field of col) {
        var val = field.parser ? field.parser(raw[j][i]) : raw[j][i]
        val = typeof val === 'string' ? val.trim() : val
  
        const obj = res[j] || {}
        obj[field.output || field.input] = val
        res[j] = obj
      }
    }
  }

  return res
}
