import assert from 'assert';

describe('escmascript-regression', function() {
  if (Meteor.isClient) {
    it('NodeList spread', function() {
      const div = document.createElement('div');
      document.body.appendChild(div);

      for (let i = 0; i < 5; i++) {
        const child = document.createElement('div');
        child.innerText = `child ${i}`;
        div.appendChild(child);
      }

      try {
        assert.strictEqual(div.childNodes?.length, 5);
        const arr = [...div.childNodes];

        arr.forEach((el, i) => {
          assert.equal(el.innerText, `child ${i}`);
        });
      } finally {
        document.body.removeChild(div);
      }
    });
  }
});
