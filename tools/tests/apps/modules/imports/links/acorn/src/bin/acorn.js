import {basename} from "path"
import {readFileSync as readFile} from "fs"
import * as acorn from "acorn"

let infile, forceFile, silent = false, compact = false, tokenize = false
const options = {}

function help(status) {
  const print = (status == 0) ? console.log : console.error
  print("usage: " + basename(process.argv[1]) + " [--ecma3|--ecma5|--ecma6|--ecma7|--ecma8|--ecma9|...|--ecma2015|--ecma2016|--ecma2017|--ecma2018|...]")
  print("        [--tokenize] [--locations] [---allow-hash-bang] [--compact] [--silent] [--module] [--help] [--] [infile]")
  process.exit(status)
}

for (let i = 2; i < process.argv.length; ++i) {
  const arg = process.argv[i]
  if ((arg == "-" || arg[0] != "-") && !infile) infile = arg
  else if (arg == "--" && !infile && i + 2 == process.argv.length) forceFile = infile = process.argv[++i]
  else if (arg == "--locations") options.locations = true
  else if (arg == "--allow-hash-bang") options.allowHashBang = true
  else if (arg == "--silent") silent = true
  else if (arg == "--compact") compact = true
  else if (arg == "--help") help(0)
  else if (arg == "--tokenize") tokenize = true
  else if (arg == "--module") options.sourceType = "module"
  else {
    let match = arg.match(/^--ecma(\d+)$/)
    if (match)
      options.ecmaVersion = +match[1]
    else
      help(1)
  }
}

function run(code) {
  let result
  try {
    if (!tokenize) {
      result = acorn.parse(code, options)
    } else {
      result = []
      let tokenizer = acorn.tokenizer(code, options), token
      do {
        token = tokenizer.getToken()
        result.push(token)
      } while (token.type != acorn.tokTypes.eof)
    }
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  if (!silent) console.log(JSON.stringify(result, null, compact ? null : 2))
}

if (forceFile || infile && infile != "-") {
  run(readFile(infile, "utf8"))
} else {
  let code = ""
  process.stdin.resume()
  process.stdin.on("data", chunk => code += chunk)
  process.stdin.on("end", () => run(code))
}
