import { join } from 'path';
import { keywordClassifyInContext } from './keyword-classifier';
import { grade, loadCorpus } from './corpus-grading';

// The agent corpus is what the keyword tables were tuned on, so its score
// says how well they fit it, not how well they generalize. This one was
// written blind and is never tuned on (see scripts/heldout-corpus/README.md):
// 93% when it was written, October 2026. The floor catches a change that
// helps the tuned corpus by overfitting it.
describe('keyword fallback on the held-out corpus', () => {
  const corpus = loadCorpus(join(__dirname, '../../../scripts/heldout-corpus'));

  it('still answers at least 88% of it, and never searches on chat', () => {
    expect(corpus.length).toBeGreaterThan(100);
    const grades = corpus.map((line) => ({
      line,
      g: grade(
        line.expect,
        keywordClassifyInContext(line.msg, { history: line.history ?? [], lastResults: line.lastResults ?? null }),
      ),
    }));
    const pass = grades.filter((x) => x.g === 'pass').length / grades.length;
    expect(grades.filter((x) => x.g === 'false_positive').map((x) => x.line.msg)).toEqual([]);
    expect(pass).toBeGreaterThanOrEqual(0.88);
  });
});
