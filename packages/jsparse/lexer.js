var regexEscape = function (str) {
  return str.replace(/[\][^$\\.*+?(){}|]/g, '\\$&');
};

// Adapted from source code of http://xregexp.com/plugins/#unicode
var unicodeCategories = {
  Ll: "0061-007A00B500DF-00F600F8-00FF01010103010501070109010B010D010F01110113011501170119011B011D011F01210123012501270129012B012D012F01310133013501370138013A013C013E014001420144014601480149014B014D014F01510153015501570159015B015D015F01610163016501670169016B016D016F0171017301750177017A017C017E-0180018301850188018C018D019201950199-019B019E01A101A301A501A801AA01AB01AD01B001B401B601B901BA01BD-01BF01C601C901CC01CE01D001D201D401D601D801DA01DC01DD01DF01E101E301E501E701E901EB01ED01EF01F001F301F501F901FB01FD01FF02010203020502070209020B020D020F02110213021502170219021B021D021F02210223022502270229022B022D022F02310233-0239023C023F0240024202470249024B024D024F-02930295-02AF037103730377037B-037D039003AC-03CE03D003D103D5-03D703D903DB03DD03DF03E103E303E503E703E903EB03ED03EF-03F303F503F803FB03FC0430-045F04610463046504670469046B046D046F04710473047504770479047B047D047F0481048B048D048F04910493049504970499049B049D049F04A104A304A504A704A904AB04AD04AF04B104B304B504B704B904BB04BD04BF04C204C404C604C804CA04CC04CE04CF04D104D304D504D704D904DB04DD04DF04E104E304E504E704E904EB04ED04EF04F104F304F504F704F904FB04FD04FF05010503050505070509050B050D050F05110513051505170519051B051D051F05210523052505270561-05871D00-1D2B1D6B-1D771D79-1D9A1E011E031E051E071E091E0B1E0D1E0F1E111E131E151E171E191E1B1E1D1E1F1E211E231E251E271E291E2B1E2D1E2F1E311E331E351E371E391E3B1E3D1E3F1E411E431E451E471E491E4B1E4D1E4F1E511E531E551E571E591E5B1E5D1E5F1E611E631E651E671E691E6B1E6D1E6F1E711E731E751E771E791E7B1E7D1E7F1E811E831E851E871E891E8B1E8D1E8F1E911E931E95-1E9D1E9F1EA11EA31EA51EA71EA91EAB1EAD1EAF1EB11EB31EB51EB71EB91EBB1EBD1EBF1EC11EC31EC51EC71EC91ECB1ECD1ECF1ED11ED31ED51ED71ED91EDB1EDD1EDF1EE11EE31EE51EE71EE91EEB1EED1EEF1EF11EF31EF51EF71EF91EFB1EFD1EFF-1F071F10-1F151F20-1F271F30-1F371F40-1F451F50-1F571F60-1F671F70-1F7D1F80-1F871F90-1F971FA0-1FA71FB0-1FB41FB61FB71FBE1FC2-1FC41FC61FC71FD0-1FD31FD61FD71FE0-1FE71FF2-1FF41FF61FF7210A210E210F2113212F21342139213C213D2146-2149214E21842C30-2C5E2C612C652C662C682C6A2C6C2C712C732C742C76-2C7B2C812C832C852C872C892C8B2C8D2C8F2C912C932C952C972C992C9B2C9D2C9F2CA12CA32CA52CA72CA92CAB2CAD2CAF2CB12CB32CB52CB72CB92CBB2CBD2CBF2CC12CC32CC52CC72CC92CCB2CCD2CCF2CD12CD32CD52CD72CD92CDB2CDD2CDF2CE12CE32CE42CEC2CEE2CF32D00-2D252D272D2DA641A643A645A647A649A64BA64DA64FA651A653A655A657A659A65BA65DA65FA661A663A665A667A669A66BA66DA681A683A685A687A689A68BA68DA68FA691A693A695A697A723A725A727A729A72BA72DA72F-A731A733A735A737A739A73BA73DA73FA741A743A745A747A749A74BA74DA74FA751A753A755A757A759A75BA75DA75FA761A763A765A767A769A76BA76DA76FA771-A778A77AA77CA77FA781A783A785A787A78CA78EA791A793A7A1A7A3A7A5A7A7A7A9A7FAFB00-FB06FB13-FB17FF41-FF5A",
  Lm: "02B0-02C102C6-02D102E0-02E402EC02EE0374037A0559064006E506E607F407F507FA081A0824082809710E460EC610FC17D718431AA71C78-1C7D1D2C-1D6A1D781D9B-1DBF2071207F2090-209C2C7C2C7D2D6F2E2F30053031-3035303B309D309E30FC-30FEA015A4F8-A4FDA60CA67FA717-A71FA770A788A7F8A7F9A9CFAA70AADDAAF3AAF4FF70FF9EFF9F",
  Lo: "00AA00BA01BB01C0-01C3029405D0-05EA05F0-05F20620-063F0641-064A066E066F0671-06D306D506EE06EF06FA-06FC06FF07100712-072F074D-07A507B107CA-07EA0800-08150840-085808A008A2-08AC0904-0939093D09500958-09610972-09770979-097F0985-098C098F09900993-09A809AA-09B009B209B6-09B909BD09CE09DC09DD09DF-09E109F009F10A05-0A0A0A0F0A100A13-0A280A2A-0A300A320A330A350A360A380A390A59-0A5C0A5E0A72-0A740A85-0A8D0A8F-0A910A93-0AA80AAA-0AB00AB20AB30AB5-0AB90ABD0AD00AE00AE10B05-0B0C0B0F0B100B13-0B280B2A-0B300B320B330B35-0B390B3D0B5C0B5D0B5F-0B610B710B830B85-0B8A0B8E-0B900B92-0B950B990B9A0B9C0B9E0B9F0BA30BA40BA8-0BAA0BAE-0BB90BD00C05-0C0C0C0E-0C100C12-0C280C2A-0C330C35-0C390C3D0C580C590C600C610C85-0C8C0C8E-0C900C92-0CA80CAA-0CB30CB5-0CB90CBD0CDE0CE00CE10CF10CF20D05-0D0C0D0E-0D100D12-0D3A0D3D0D4E0D600D610D7A-0D7F0D85-0D960D9A-0DB10DB3-0DBB0DBD0DC0-0DC60E01-0E300E320E330E40-0E450E810E820E840E870E880E8A0E8D0E94-0E970E99-0E9F0EA1-0EA30EA50EA70EAA0EAB0EAD-0EB00EB20EB30EBD0EC0-0EC40EDC-0EDF0F000F40-0F470F49-0F6C0F88-0F8C1000-102A103F1050-1055105A-105D106110651066106E-10701075-1081108E10D0-10FA10FD-1248124A-124D1250-12561258125A-125D1260-1288128A-128D1290-12B012B2-12B512B8-12BE12C012C2-12C512C8-12D612D8-13101312-13151318-135A1380-138F13A0-13F41401-166C166F-167F1681-169A16A0-16EA1700-170C170E-17111720-17311740-17511760-176C176E-17701780-17B317DC1820-18421844-18771880-18A818AA18B0-18F51900-191C1950-196D1970-19741980-19AB19C1-19C71A00-1A161A20-1A541B05-1B331B45-1B4B1B83-1BA01BAE1BAF1BBA-1BE51C00-1C231C4D-1C4F1C5A-1C771CE9-1CEC1CEE-1CF11CF51CF62135-21382D30-2D672D80-2D962DA0-2DA62DA8-2DAE2DB0-2DB62DB8-2DBE2DC0-2DC62DC8-2DCE2DD0-2DD62DD8-2DDE3006303C3041-3096309F30A1-30FA30FF3105-312D3131-318E31A0-31BA31F0-31FF3400-4DB54E00-9FCCA000-A014A016-A48CA4D0-A4F7A500-A60BA610-A61FA62AA62BA66EA6A0-A6E5A7FB-A801A803-A805A807-A80AA80C-A822A840-A873A882-A8B3A8F2-A8F7A8FBA90A-A925A930-A946A960-A97CA984-A9B2AA00-AA28AA40-AA42AA44-AA4BAA60-AA6FAA71-AA76AA7AAA80-AAAFAAB1AAB5AAB6AAB9-AABDAAC0AAC2AADBAADCAAE0-AAEAAAF2AB01-AB06AB09-AB0EAB11-AB16AB20-AB26AB28-AB2EABC0-ABE2AC00-D7A3D7B0-D7C6D7CB-D7FBF900-FA6DFA70-FAD9FB1DFB1F-FB28FB2A-FB36FB38-FB3CFB3EFB40FB41FB43FB44FB46-FBB1FBD3-FD3DFD50-FD8FFD92-FDC7FDF0-FDFBFE70-FE74FE76-FEFCFF66-FF6FFF71-FF9DFFA0-FFBEFFC2-FFC7FFCA-FFCFFFD2-FFD7FFDA-FFDC",
  Lt: "01C501C801CB01F21F88-1F8F1F98-1F9F1FA8-1FAF1FBC1FCC1FFC",
  Lu: "0041-005A00C0-00D600D8-00DE01000102010401060108010A010C010E01100112011401160118011A011C011E01200122012401260128012A012C012E01300132013401360139013B013D013F0141014301450147014A014C014E01500152015401560158015A015C015E01600162016401660168016A016C016E017001720174017601780179017B017D018101820184018601870189-018B018E-0191019301940196-0198019C019D019F01A001A201A401A601A701A901AC01AE01AF01B1-01B301B501B701B801BC01C401C701CA01CD01CF01D101D301D501D701D901DB01DE01E001E201E401E601E801EA01EC01EE01F101F401F6-01F801FA01FC01FE02000202020402060208020A020C020E02100212021402160218021A021C021E02200222022402260228022A022C022E02300232023A023B023D023E02410243-02460248024A024C024E03700372037603860388-038A038C038E038F0391-03A103A3-03AB03CF03D2-03D403D803DA03DC03DE03E003E203E403E603E803EA03EC03EE03F403F703F903FA03FD-042F04600462046404660468046A046C046E04700472047404760478047A047C047E0480048A048C048E04900492049404960498049A049C049E04A004A204A404A604A804AA04AC04AE04B004B204B404B604B804BA04BC04BE04C004C104C304C504C704C904CB04CD04D004D204D404D604D804DA04DC04DE04E004E204E404E604E804EA04EC04EE04F004F204F404F604F804FA04FC04FE05000502050405060508050A050C050E05100512051405160518051A051C051E05200522052405260531-055610A0-10C510C710CD1E001E021E041E061E081E0A1E0C1E0E1E101E121E141E161E181E1A1E1C1E1E1E201E221E241E261E281E2A1E2C1E2E1E301E321E341E361E381E3A1E3C1E3E1E401E421E441E461E481E4A1E4C1E4E1E501E521E541E561E581E5A1E5C1E5E1E601E621E641E661E681E6A1E6C1E6E1E701E721E741E761E781E7A1E7C1E7E1E801E821E841E861E881E8A1E8C1E8E1E901E921E941E9E1EA01EA21EA41EA61EA81EAA1EAC1EAE1EB01EB21EB41EB61EB81EBA1EBC1EBE1EC01EC21EC41EC61EC81ECA1ECC1ECE1ED01ED21ED41ED61ED81EDA1EDC1EDE1EE01EE21EE41EE61EE81EEA1EEC1EEE1EF01EF21EF41EF61EF81EFA1EFC1EFE1F08-1F0F1F18-1F1D1F28-1F2F1F38-1F3F1F48-1F4D1F591F5B1F5D1F5F1F68-1F6F1FB8-1FBB1FC8-1FCB1FD8-1FDB1FE8-1FEC1FF8-1FFB21022107210B-210D2110-211221152119-211D212421262128212A-212D2130-2133213E213F214521832C00-2C2E2C602C62-2C642C672C692C6B2C6D-2C702C722C752C7E-2C802C822C842C862C882C8A2C8C2C8E2C902C922C942C962C982C9A2C9C2C9E2CA02CA22CA42CA62CA82CAA2CAC2CAE2CB02CB22CB42CB62CB82CBA2CBC2CBE2CC02CC22CC42CC62CC82CCA2CCC2CCE2CD02CD22CD42CD62CD82CDA2CDC2CDE2CE02CE22CEB2CED2CF2A640A642A644A646A648A64AA64CA64EA650A652A654A656A658A65AA65CA65EA660A662A664A666A668A66AA66CA680A682A684A686A688A68AA68CA68EA690A692A694A696A722A724A726A728A72AA72CA72EA732A734A736A738A73AA73CA73EA740A742A744A746A748A74AA74CA74EA750A752A754A756A758A75AA75CA75EA760A762A764A766A768A76AA76CA76EA779A77BA77DA77EA780A782A784A786A78BA78DA790A792A7A0A7A2A7A4A7A6A7A8A7AAFF21-FF3A",
  Mc: "0903093B093E-09400949-094C094E094F0982098309BE-09C009C709C809CB09CC09D70A030A3E-0A400A830ABE-0AC00AC90ACB0ACC0B020B030B3E0B400B470B480B4B0B4C0B570BBE0BBF0BC10BC20BC6-0BC80BCA-0BCC0BD70C01-0C030C41-0C440C820C830CBE0CC0-0CC40CC70CC80CCA0CCB0CD50CD60D020D030D3E-0D400D46-0D480D4A-0D4C0D570D820D830DCF-0DD10DD8-0DDF0DF20DF30F3E0F3F0F7F102B102C10311038103B103C105610571062-10641067-106D108310841087-108C108F109A-109C17B617BE-17C517C717C81923-19261929-192B193019311933-193819B0-19C019C819C91A19-1A1B1A551A571A611A631A641A6D-1A721B041B351B3B1B3D-1B411B431B441B821BA11BA61BA71BAA1BAC1BAD1BE71BEA-1BEC1BEE1BF21BF31C24-1C2B1C341C351CE11CF21CF3302E302FA823A824A827A880A881A8B4-A8C3A952A953A983A9B4A9B5A9BAA9BBA9BD-A9C0AA2FAA30AA33AA34AA4DAA7BAAEBAAEEAAEFAAF5ABE3ABE4ABE6ABE7ABE9ABEAABEC",
  Mn: "0300-036F0483-04870591-05BD05BF05C105C205C405C505C70610-061A064B-065F067006D6-06DC06DF-06E406E706E806EA-06ED07110730-074A07A6-07B007EB-07F30816-0819081B-08230825-08270829-082D0859-085B08E4-08FE0900-0902093A093C0941-0948094D0951-095709620963098109BC09C1-09C409CD09E209E30A010A020A3C0A410A420A470A480A4B-0A4D0A510A700A710A750A810A820ABC0AC1-0AC50AC70AC80ACD0AE20AE30B010B3C0B3F0B41-0B440B4D0B560B620B630B820BC00BCD0C3E-0C400C46-0C480C4A-0C4D0C550C560C620C630CBC0CBF0CC60CCC0CCD0CE20CE30D41-0D440D4D0D620D630DCA0DD2-0DD40DD60E310E34-0E3A0E47-0E4E0EB10EB4-0EB90EBB0EBC0EC8-0ECD0F180F190F350F370F390F71-0F7E0F80-0F840F860F870F8D-0F970F99-0FBC0FC6102D-10301032-10371039103A103D103E10581059105E-10601071-1074108210851086108D109D135D-135F1712-17141732-1734175217531772177317B417B517B7-17BD17C617C9-17D317DD180B-180D18A91920-19221927192819321939-193B1A171A181A561A58-1A5E1A601A621A65-1A6C1A73-1A7C1A7F1B00-1B031B341B36-1B3A1B3C1B421B6B-1B731B801B811BA2-1BA51BA81BA91BAB1BE61BE81BE91BED1BEF-1BF11C2C-1C331C361C371CD0-1CD21CD4-1CE01CE2-1CE81CED1CF41DC0-1DE61DFC-1DFF20D0-20DC20E120E5-20F02CEF-2CF12D7F2DE0-2DFF302A-302D3099309AA66FA674-A67DA69FA6F0A6F1A802A806A80BA825A826A8C4A8E0-A8F1A926-A92DA947-A951A980-A982A9B3A9B6-A9B9A9BCAA29-AA2EAA31AA32AA35AA36AA43AA4CAAB0AAB2-AAB4AAB7AAB8AABEAABFAAC1AAECAAEDAAF6ABE5ABE8ABEDFB1EFE00-FE0FFE20-FE26",
  Nd: "0030-00390660-066906F0-06F907C0-07C90966-096F09E6-09EF0A66-0A6F0AE6-0AEF0B66-0B6F0BE6-0BEF0C66-0C6F0CE6-0CEF0D66-0D6F0E50-0E590ED0-0ED90F20-0F291040-10491090-109917E0-17E91810-18191946-194F19D0-19D91A80-1A891A90-1A991B50-1B591BB0-1BB91C40-1C491C50-1C59A620-A629A8D0-A8D9A900-A909A9D0-A9D9AA50-AA59ABF0-ABF9FF10-FF19",
  Nl: "16EE-16F02160-21822185-218830073021-30293038-303AA6E6-A6EF",
  Pc: "005F203F20402054FE33FE34FE4D-FE4FFF3F"
};

var unicodeClass = function (abbrev) {
  return '[' +
    unicodeCategories[abbrev].replace(/[0-9A-F]{4}/ig, "\\u$&") + ']';
};

// See ECMA-262 spec, 3rd edition, section 7

// Section 7.2
// Match one or more characters of whitespace, excluding line terminators.
// Do this by matching reluctantly, stopping at a non-dot (line terminator
// or end of string) or a non-whitespace.
// We are taking advantage of the fact that we are parsing JS from JS in
// regexes like this by "passing through" the spec's definition of whitespace,
// which is the same in regexes and the lexical grammar.
var rWhiteSpace = /[^\S\u000A\u000D\u2028\u2029]+/g;
// Section 7.3
// Match one line terminator.  Same as (?!.)[\s\S] but more explicit.
var rLineTerminator = /[\u000A\u000D\u2028\u2029]/g;
// Section 7.4
// Match one multi-line comment.
// [\s\S] is shorthand for any character, including newlines.
// The *? reluctant qualifier makes this easy.
var rMultiLineComment = /\/\*[\s\S]*?\*\//g;
// Match one single-line comment, not including the line terminator.
var rSingleLineComment = /\/\/.*/g;
// Section 7.6
// Match one or more characters that can start an identifier.
// This is IdentifierStart+.
var rIdentifierPrefix = new RegExp(
  "([a-zA-Z$_]+|\\\\u[0-9a-fA-F]{4}|" +
    [unicodeClass('Lu'), unicodeClass('Ll'), unicodeClass('Lt'),
     unicodeClass('Lm'), unicodeClass('Lo'), unicodeClass('Nl')].join('|') +
    ")+", 'g');
// Match one or more characters that can continue an identifier.
// This is (IdentifierPart and not IdentifierStart)+.
// To match a full identifier, match rIdentifierPrefix, then
// match rIdentifierMiddle followed by rIdentifierPrefix until they both fail.
var rIdentifierMiddle = new RegExp(
  "([0-9]|" + [unicodeClass('Mn'), unicodeClass('Mc'), unicodeClass('Nd'),
               unicodeClass('Pc')].join('|') + ")+", 'g');
// Section 7.7
// Match one punctuator (except for division punctuators).
var rPunctuator = new RegExp(
  regexEscape("{ } ( ) [ ] . ; , < > <= >= == != === !== + - * % ++ -- << >> "+
              ">>> & | ^ ! ~ && || ? : = += -= *= %= <<= >>= >>>= &= |= ^=")
  // sort from longest to shortest so that we don't match '==' for '===' and
  // '*' for '*=', etc.
    .split(' ').sort(function (a,b) { return b.length - a.length; })
    .join('|'), 'g');
var rDivPunctuator = /\/=?/g;
// Section 7.8.3
var rHexLiteral = /0[xX][0-9a-fA-F]+(?!\w)/g;
var rOctLiteral = /0[0-7]+(?!\w)/g; // deprecated
var rDecLiteral =
      /(((0|[1-9][0-9]*)(\.[0-9]*)?)|\.[0-9]+)([Ee][+-]?[0-9]+)?(?!\w)/g;
// Section 7.8.4
var rStringQuote = /["']/g;
// Match one or more characters besides quotes, backslashes, or line ends
var rStringMiddle = /(?=.)[^"'\\]+?((?!.)|(?=["'\\]))/g;
// Match one escape sequence, including the backslash.
var rEscapeSequence =
      /\\(['"\\bfnrtv]|0(?![0-9])|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|(?=.)[^ux0-9])/g;
// Match one ES5 line continuation
var rLineContinuation =
      /\\(\r\n|[\u000A\u000D\u2028\u2029])/g;
// Section 7.8.5
// Match one regex literal, including slashes, not including flags.
// Support unescaped '/' in character classes, per 5th ed.
// For example: `/[/]/` will match the string `"/"`.
//
// Explanation of regex:
// - Match `/` not followed by `/` or `*`
// - Match one or more of any of these:
//   - Backslash followed by one non-newline
//   - One non-newline, not `[` or `\` or `/`
//   - A character class, beginning with `[` and ending with `]`.
//     In the middle is zero or more of any of these:
//     - Backslash followed by one non-newline
//     - One non-newline, not `]` or `\`
// - Match closing `/`
var rRegexLiteral =
      /\/(?![*\/])(\\.|(?=.)[^\[\/\\]|\[(\\.|(?=.)[^\]\\])*\])+\//g;
var rRegexFlags = /[a-zA-Z]*/g;

var rDecider =
      /((?=.)\s)|(\/[\/\*]?)|([\][{}();,<>=!+*%&|^~?:-]|\.(?![0-9]))|([\d.])|(["'])|(.)|([\S\s])/g;

var keywordLookup = {
  ' break': 'KEYWORD',
  ' case': 'KEYWORD',
  ' catch': 'KEYWORD',
  ' continue': 'KEYWORD',
  ' debugger': 'KEYWORD',
  ' default': 'KEYWORD',
  ' delete': 'KEYWORD',
  ' do': 'KEYWORD',
  ' else': 'KEYWORD',
  ' finally': 'KEYWORD',
  ' for': 'KEYWORD',
  ' function': 'KEYWORD',
  ' if': 'KEYWORD',
  ' in': 'KEYWORD',
  ' instanceof': 'KEYWORD',
  ' new': 'KEYWORD',
  ' return': 'KEYWORD',
  ' switch': 'KEYWORD',
  ' this': 'KEYWORD',
  ' throw': 'KEYWORD',
  ' try': 'KEYWORD',
  ' typeof': 'KEYWORD',
  ' var': 'KEYWORD',
  ' void': 'KEYWORD',
  ' while': 'KEYWORD',
  ' with': 'KEYWORD',

  ' false': 'BOOLEAN',
  ' true': 'BOOLEAN',

  ' null': 'NULL'
};

var makeSet = function (array) {
  var s = {};
  for (var i = 0, N = array.length; i < N; i++)
    s[array[i]] = true;
  return s;
};

var nonTokenTypes = makeSet('WHITESPACE COMMENT NEWLINE EOF ERROR'.split(' '));

var punctuationBeforeDivision = makeSet('] ) } ++ --'.split(' '));
var keywordsBeforeDivision = makeSet('this'.split(' '));

var guessIsDivisionPermittedAfterToken = function (tok) {
  // Figure out if a '/' character should be interpreted as division
  // rather than the start of a regular expression when it follows the
  // token, which must be a token lexeme per isToken().
  // The beginning of section 7 of the spec briefly
  // explains what's going on; basically the lexical grammar can't
  // distinguish, for example, `e/f/g` (division) from `e=/f/g`
  // (assignment of a regular expression), among many other variations.
  //
  // THIS IS ONLY A HEURISTIC, though it will rarely fail.
  // Here are the two cases I know of where help from the parser is needed:
  //  - if (foo)
  //        /ba/.test("banana") && console.log("matches");
  //    (Close paren of a control structure before a statement starting with
  //     a regex literal.  Starting a statement with a regex literal is
  //     unusual, of course, because it's hard to have a side effect.)
  //  - ++ /foo/.abc
  //    (Prefix `++` or `--` before an expression starting with a regex
  //     literal.  This will run but I can't see any use for it.)
  switch (tok.type()) {
  case "PUNCTUATION":
    // few punctuators can end an expression, but e.g. `)`
    return !! punctuationBeforeDivision[tok.text()];
  case "KEYWORD":
    // few keywords can end an expression, but e.g. `this`
    return !! keywordsBeforeDivision[tok.text()];
  case "IDENTIFIER":
    return true;
  default: // literal
    return true;
  }
};

////////// PUBLIC API

var Lexeme = function (pos, type, text) {
  this._pos = pos;
  this._type = type;
  this._text = text;
};

Lexeme.prototype.startPos = function () {
  return this._pos;
};

Lexeme.prototype.endPos = function () {
  return this._pos + this._text.length;
};

Lexeme.prototype.type = function () {
  return this._type;
};

Lexeme.prototype.text = function () {
  return this._text;
};

Lexeme.prototype.isToken = function () {
  return ! nonTokenTypes[this._type];
};

Lexeme.prototype.isError = function () {
  return this._type === "ERROR";
};

Lexeme.prototype.isEOF = function () {
  return this._type === "EOF";
};

Lexeme.prototype.prev = function () {
  return this._prev;
};

Lexeme.prototype.next = function () {
  return this._next;
};

Lexeme.prototype.toString = function () {
  return this.isError() ? "ERROR" :
    this.isEOF() ? "EOF" : "`" + this.text() + "`";
};

// Create a Lexer for the given string of JavaScript code.
//
// A lexer keeps a pointer `pos` into the string that is
// advanced when you ask for the next lexeme with `next()`.
//
// XXXXX UPDATE DOCS
// Properties:
//   code: Original JavaScript code string.
//   pos:  Current index into the string.  You can assign to it
//           to continue lexing from a different position.  After
//           calling next(), it is the ending index of the most
//           recent lexeme.
//   lastPos:  The starting index of the most recent lexeme.
//           Equal to `pos - text.length`.
//   text: Text of the last lexeme as a string.
//   type: Type of the last lexeme, as returned by `next()`.
//   divisionPermitted: Whether a '/' character should be interpreted
//           as division rather than the start of a regular expression.
//           This flag is set automatically during lexing based on the
//           previous token (i.e. the most recent token lexeme), but
//           it is technically only a heuristic.
//           Thie flag can be read and set manually to affect the
//           parsing of the next token.

JSLexer = function (code) {
  this.code = code;
  this.pos = 0;
  this.divisionPermitted = false;
  this.lastLexeme = null;
};

JSLexer.Lexeme = Lexeme;

// XXXX UPDATE DOCS
// Return the type of the next of lexeme starting at `pos`, and advance
// `pos` to the end of the lexeme.  The text of the lexeme is available
// in `text`.  The text is always the substring of `code` between the
// old and new values of `pos`.  An "EOF" lexeme terminates
// the stream.  "ERROR" lexemes indicate a bad input string.  Out of all
// lexemes, only "EOF" has empty text, and it always has empty text.
// All others contain at least one character from the source code.
//
// Lexeme types:
// Literals: BOOLEAN, NULL, REGEX, NUMBER, STRING
// Whitespace-like: WHITESPACE, COMMENT, NEWLINE, EOF
// Other Tokens: IDENTIFIER, KEYWORD, PUNCTUATION
// ... and ERROR

JSLexer.prototype.next = function () {
  var self = this;
  var code = self.code;
  var origPos = self.pos;
  var divisionPermitted = self.divisionPermitted;

  if (origPos > code.length)
    throw new Error("out of range");

  // Running regexes inside this function will move this local
  // `pos` forward.
  // When we commit to emitting a lexeme, we'll set self.pos
  // based on it.
  var pos = origPos;

  // Emit a lexeme.  Always called as `return lexeme(type)`.
  var lexeme = function (type) {
    // If `pos` hasn't moved, we consider this an error.
    // This means that grammar cases that only run one regex
    // or an alternation ('||') of regexes don't need to
    // check for failure.
    // This also guarantees that only EOF lexemes are empty.
    if (pos === origPos && type !== 'EOF') {
      type = 'ERROR';
      pos = origPos + 1;
    }
    self.pos = pos;
    var lex = new JSLexer.Lexeme(origPos, type, code.substring(origPos, pos));
    if (self.lastLexeme) {
      self.lastLexeme._next = lex;
      lex._prev = self.lastLexeme;
    }
    self.lastLexeme = lex;
    if (lex.isToken())
      self.divisionPermitted = guessIsDivisionPermittedAfterToken(lex);
    return lex;
  };

  if (pos === code.length)
    return lexeme('EOF');

  // Result of the regex match in the most recent call to `run`.
  var match = null;

  // Run a regex starting from `pos`, recording the end of the matched
  // string in `pos` and the match data in `match`.  The regex must have
  // the 'g' (global) flag.  If it doesn't match at `pos`, set `match`
  // to null.  The caller should expect the regex to match at `pos`, as
  // failure is too expensive to run in a tight loop.
  var run = function (regex) {
    // Cause regex matching to start at `pos`.
    regex.lastIndex = pos;
    match = regex.exec(code);
    // Simulate "sticky" matching by throwing out the match if it
    // didn't match exactly at `pos`.  If it didn't, we may have
    // just searched the entire string.
    if (match && (match.index !== pos))
      match = null;
    // Record the end position of the match back into `pos`.
    // Avoid an IE7 bug where lastIndex is incremented when
    // the match has 0 length.
    if (match && match[0].length !== 0)
      pos = regex.lastIndex;
    return match;
  };

  // Decide which case of the grammar we are in based on one or two
  // characters, then roll back `pos`.
  run(rDecider);
  pos = origPos;

  // Grammar cases
  if (match[1]) { // \s
    run(rWhiteSpace);
    return lexeme('WHITESPACE');
  }
  if (match[2]) { // one of //, /*, /
    if (match[2] === '//') {
      run(rSingleLineComment);
      return lexeme('COMMENT');
    }
    if (match[2] === '/*') {
      run(rMultiLineComment);
      return lexeme(match ? 'COMMENT' : 'ERROR');
    }
    if (match[2] === '/') {
      if (divisionPermitted) {
        run(rDivPunctuator);
        return lexeme('PUNCTUATION');
      } else {
        run(rRegexLiteral);
        if (! match)
          return lexeme('ERROR');
        run(rRegexFlags);
        return lexeme('REGEX');
      }
    }
  }
  if (match[3]) { // any other punctuation char
    run(rPunctuator);
    return lexeme(match ? 'PUNCTUATION' : 'ERROR');
  }
  if (match[4]) { // 0-9
    run(rDecLiteral) || run(rHexLiteral) || run(rOctLiteral);
    return lexeme(match ? 'NUMBER' : 'ERROR');
  }
  if (match[5]) { // " or '
    run(rStringQuote);
    var quote = match[0];
    do {
      run(rStringMiddle) || run(rEscapeSequence) ||
        run(rLineContinuation) || run(rStringQuote);
    } while (match && match[0] !== quote);
    if (! (match && match[0] === quote))
      return lexeme('ERROR');
    return lexeme('STRING');
  }
  if (match[7]) { // non-dot (line terminator)
    run(rLineTerminator);
    return lexeme('NEWLINE');
  }
  // dot (any non-line-terminator)
  run(rIdentifierPrefix);
  // Use non-short-circuiting bitwise OR, '|', to always try
  // both regexes in sequence, returning false only if neither
  // matched.
  while ((!! run(rIdentifierMiddle)) |
         (!! run(rIdentifierPrefix))) { /*continue*/ }
  var word = code.substring(origPos, pos);
  return lexeme(keywordLookup[' '+word] || 'IDENTIFIER');
};

JSLexer.prettyOffset = function (code, pos) {
  var codeUpToPos = code.substring(0, pos);
  var startOfLine = codeUpToPos.lastIndexOf('\n') + 1;
  var indexInLine = pos - startOfLine; // 0-based
  var lineNum = codeUpToPos.replace(/[^\n]+/g, '').length + 1; // 1-based
  return "line " + lineNum + ", offset " + indexInLine;
};
