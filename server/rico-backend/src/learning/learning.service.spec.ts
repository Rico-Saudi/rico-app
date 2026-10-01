import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { LearningService } from './learning.service';
import { KnowledgeGap, KnowledgeGapDocument, KnowledgeGapSchema } from './schemas/knowledge-gap.schema';
import { Lesson, LessonDocument, LessonSchema } from './schemas/lesson.schema';
import { TrainingRun, TrainingRunDocument, TrainingRunSchema } from './schemas/training-run.schema';
import { learnedExamplesBlock, lessonRegistry } from './constants/lessons.registry';
import { ProfessionsService } from '../professionals/professions.service';

// The whole point of the feature is a loop — a question Rico failed on
// becomes a row, a row becomes a lesson, a lesson becomes part of the prompt
// — so this runs it against a real (in-memory) Mongo end to end rather than
// asserting on mocked models.
describe('LearningService', () => {
  let mongod: MongoMemoryServer;
  let service: LearningService;
  let gapModel: Model<KnowledgeGapDocument>;
  let lessonModel: Model<LessonDocument>;
  let runModel: Model<TrainingRunDocument>;

  const created: any[] = [];
  const professions = { create: async (dto: any) => void created.push(dto) } as unknown as ProfessionsService;

  const ask = (message: string, brand = 'tadallal') =>
    service.record({ message, brand, dialect: brand === 'tadallal' ? 'jordanian' : 'saudi', ricoReply: 'ما فهمتك' });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    gapModel = mongoose.model(KnowledgeGap.name, KnowledgeGapSchema) as unknown as Model<KnowledgeGapDocument>;
    lessonModel = mongoose.model(Lesson.name, LessonSchema) as unknown as Model<LessonDocument>;
    runModel = mongoose.model(TrainingRun.name, TrainingRunSchema) as unknown as Model<TrainingRunDocument>;
    service = new LearningService(gapModel, lessonModel, runModel, professions);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    created.length = 0;
    lessonRegistry.replaceAll([]);
    await Promise.all([gapModel.deleteMany({}), lessonModel.deleteMany({}), runModel.deleteMany({})]);
  });

  describe('recording what Rico missed', () => {
    it('counts the same question asked twice as one row', async () => {
      await ask('بدي حدا يصلّح لي البويلر');
      await ask('بِدّي حدا يصلّح لي البويلر؟؟');

      const rows = await gapModel.find().lean();
      expect(rows).toHaveLength(1);
      expect(rows[0].count).toBe(2);
      expect(rows[0].status).toBe('open');
    });

    it('keeps the phrasings people actually used', async () => {
      await ask('بدي بويلرجي');
      await ask('بدي بويلرجي!!');

      const { items } = await service.listGaps({});
      expect(items[0].variants).toEqual(expect.arrayContaining(['بدي بويلرجي', 'بدي بويلرجي!!']));
    });

    it('records which brands hit it, so the lesson can be dialect-specific', async () => {
      await ask('بدي بويلرجي', 'tadallal');
      await ask('بدي بويلرجي', 'rico');

      const row = await gapModel.findOne().lean();
      expect(row!.brands.sort()).toEqual(['rico', 'tadallal']);
    });

    it('drops a message with nothing to learn from', async () => {
      await ask('😅😅');
      await ask('!!!');
      expect(await gapModel.countDocuments()).toBe(0);
    });

    it('sorts the queue by how often a question was asked', async () => {
      await ask('سؤال نادر');
      await ask('سؤال متكرر');
      await ask('سؤال متكرر');

      const { items } = await service.listGaps({ status: 'open' });
      expect(items[0].message).toBe('سؤال متكرر');
    });

    it('finds a gap by a differently-spelled search term', async () => {
      await ask('وين ألاقي بويلرجي؟');
      const { items } = await service.listGaps({ q: 'بويلرجى' });
      expect(items).toHaveLength(1);
    });
  });

  describe('approving a lesson', () => {
    const pendingExample = (over: Record<string, unknown> = {}) =>
      lessonModel.create({
        kind: 'example',
        message: 'بدي إشي يسد الجوع',
        dialect: 'jordanian',
        intents: [{ kind: 'place', category: 'restaurant', rank: 'nearest' }],
        note: 'جوع = مطعم',
        ...over,
      });

    it('puts the example in the prompt immediately, without a redeploy', async () => {
      const lesson = await pendingExample();
      await service.approve(String(lesson._id), 'owner@rico', {});

      expect(learnedExamplesBlock('jordanian')).toContain('بدي إشي يسد الجوع');
      // And only in that dialect — the phrasing is Jordanian.
      expect(learnedExamplesBlock('saudi')).toBe('');
    });

    it('closes the gaps the lesson covers so they stop filling the queue', async () => {
      await ask('بدي إشي يسد الجوع');
      const gap = await gapModel.findOne().lean();
      const lesson = await pendingExample({ gapIds: [gap!._id] });

      await service.approve(String(lesson._id), 'owner@rico', {});
      expect((await gapModel.findById(gap!._id).lean())!.status).toBe('taught');
    });

    it('refuses an example whose intents do not survive the classifier rules', async () => {
      // A category nobody defined would be dropped at answer time, so an
      // approval that let it through would promise a shape Rico never returns.
      const lesson = await pendingExample({ intents: [{ kind: 'place', category: 'مطعم فخم' }], reply: null });
      await expect(service.approve(String(lesson._id), 'owner@rico', {})).rejects.toThrow();
    });

    it('takes the owner edit over the model wording', async () => {
      const lesson = await pendingExample();
      await service.approve(String(lesson._id), 'owner@rico', { message: 'جوعان وما بعرف وين أروح' });

      expect(learnedExamplesBlock('jordanian')).toContain('جوعان وما بعرف وين أروح');
    });

    it('creates the trade when the lesson is a new profession', async () => {
      const lesson = await lessonModel.create({
        kind: 'profession',
        message: 'بدي بويلرجي',
        profession: { slug: 'boiler_technician', label: 'فني بويلرات', group: 'maintenance', aliases: ['بويلر'] },
      });

      await service.approve(String(lesson._id), 'owner@rico', {});

      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ slug: 'boiler_technician', label: 'فني بويلرات' });
      // A trade is not an example — it must not also land in the prompt.
      expect(learnedExamplesBlock('saudi')).toBe('');
    });

    it('marks the gaps ignored when the lesson says the question is out of scope', async () => {
      await ask('كم نتيجة مباراة الهلال');
      const gap = await gapModel.findOne().lean();
      const lesson = await lessonModel.create({ kind: 'skip', message: 'أخبار رياضية', gapIds: [gap!._id] });

      await service.approve(String(lesson._id), 'owner@rico', {});
      expect((await gapModel.findById(gap!._id).lean())!.status).toBe('ignored');
    });

    it('refuses to review the same lesson twice', async () => {
      const lesson = await pendingExample();
      await service.approve(String(lesson._id), 'owner@rico', {});
      await expect(service.approve(String(lesson._id), 'owner@rico', {})).rejects.toThrow();
    });
  });

  describe('rejecting and retiring', () => {
    it('puts the question back in the queue when the proposal was wrong', async () => {
      // The proposal failed, not the question — the next run should try again.
      await ask('بدي بويلرجي');
      const gap = await gapModel.findOneAndUpdate({}, { $set: { status: 'proposed' } }, { new: true }).lean();
      const lesson = await lessonModel.create({ kind: 'example', message: 'x', reply: 'y', gapIds: [gap!._id] });

      await service.reject(String(lesson._id), 'owner@rico');
      expect((await gapModel.findById(gap!._id).lean())!.status).toBe('open');
    });

    it('takes a taught lesson back out of the prompt', async () => {
      const lesson = await lessonModel.create({
        kind: 'example',
        status: 'approved',
        message: 'بدي إشي يسد الجوع',
        dialect: 'any',
        intents: [{ kind: 'place', category: 'restaurant', rank: 'nearest' }],
      });
      await service.refresh();
      expect(learnedExamplesBlock('saudi')).toContain('بدي إشي يسد الجوع');

      await service.retire(String(lesson._id), 'owner@rico');
      expect(learnedExamplesBlock('saudi')).toBe('');
    });
  });

  it('reports what is waiting for the owner', async () => {
    await ask('سؤال أول');
    await ask('سؤال أول');
    await ask('سؤال ثاني');
    await lessonModel.create({ kind: 'example', message: 'x', reply: 'y' });

    const stats = await service.stats();
    expect(stats.openAsks).toBe(3); // مرتين + مرة، لا صفّين
    expect(stats.pendingLessons).toBe(1);
    expect(stats.approvedExamples).toBe(0);
  });
});
