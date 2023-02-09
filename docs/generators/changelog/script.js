const _fs = require('fs');
const fs = _fs.promises;
const main = async () => {
  try {
    console.log('started concatenating files');
    const files = await fs.readdir('./generators/changelog/versions', 'utf8');
    const filesStream = files
      .map(file => {
        console.log(`reading file: ${ file }`);
        return fs.readFile(`./generators/changelog/versions/${ file }`, 'utf8');
      })
      .reverse();
    console.log('Giving some touches to the files');
    const filesContent = await Promise.all(filesStream);
    await fs.writeFile('./history.md', filesContent.join(''));
    console.log('Finished :)');

  }catch (e) {
    console.log(e);
  }

}
main().then(_ => _);
