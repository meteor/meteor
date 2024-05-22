'use strict';

(async () => {
  if (Meteor.isServer) {
    // c\u0327 = 2 code points: U+0063 LATIN SMALL LETTER C and U+0327 COMBINING
    //           CEDILLA
    // \xE7 = 1 code point: U+00E7 LATIN SMALL LETTER C WITH CEDILLA
    const filenames = [
      'maça verde.txt',
      'mac\u0327a verde.txt',
      'ma\xE7a verde.txt',
    ];

    let index = 0;
    for (const filename of filenames) {
      console.log(`${++index} - getText: ${await Assets.getTextAsync(filename)}`);
    }

    filenames.forEach((filename, index) => {
      console.log(
        `${index + 1} - absoluteFilePath: ${Assets.absoluteFilePath(filename)}`
      );
    });
  }
})();
