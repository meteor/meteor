const _fs = require('fs');
const fs = _fs.promises;
const main = async () => {
  try {
    console.log('started concatenating files');
    const files = await fs.readdir('./generators/changelog/versions', 'utf8');
    const filesStream = files
      .map(file => {
        console.log(`reading file: ${ file }`);
        const readStream = _fs.createReadStream(`./generators/changelog/versions/${ file }`, 'utf8');
        return new Promise((resolve, reject) => {
          let data = '';
          readStream.on('data', chunk => data += chunk);
          readStream.on('end', () => resolve(data));
          readStream.on('error', reject);
        });
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
