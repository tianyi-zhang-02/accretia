/**
 * Role-level starting points for the career-stage builder. Four tracks:
 * `legal` (BigLaw → in-house → government), `swe` (IC SWE → EM → MLE/research
 * → PM/DS), `medicine` (physicians by specialty + advanced-practice), and
 * `finance` (banking / PE / hedge fund / consulting). Each entry fills the
 * salary-curve fields on a career stage; everything stays editable after the
 * user picks one.
 *
 * ## Last reviewed: 2026-07
 *
 * These numbers are ROUGH ILLUSTRATIVE DEFAULTS, not market data and not
 * sourced from a specific survey. They reflect a back-of-envelope read of
 * publicly-discussed US total compensation (levels.fyi-style aggregates for
 * tech, Medscape/MGMA-style ranges for medicine, public bonus norms for
 * finance) as of the date above. The point is to give a starting anchor so
 * nobody types into a blank field — NOT to assert "this is what the role
 * pays." Override every number with your own real offer / W-2 figure.
 *
 * Comp is split three ways, matching the engine:
 *   - `baseSalary`   — annual base, pre-bonus/equity, pre-tax.
 *   - `bonusPct`     — cash bonus as a % of base.
 *   - `annualEquity` — annual equity / RSU grant value in dollars. For
 *     big-tech and frontier-AI roles this is often the LARGEST component.
 *     Treated as ordinary taxable income (RSUs vest as W-2 income).
 *   - `annualRaisePct` — within-stage YoY raise on base (nominal). To model
 *     a promotion, add a second stage with a higher `startAge`.
 *
 * Every role carries `title`/`notes` (English) and `titleZh`/`notesZh`
 * (简体中文) so the picker is fully bilingual.
 */

export type RoleTrack = 'legal' | 'swe' | 'medicine' | 'finance';

export const TRACK_LABELS: Record<RoleTrack, string> = {
  legal: 'Legal',
  swe: 'Software / ML',
  medicine: 'Medicine',
  finance: 'Finance / Consulting',
};

/**
 * Extra search terms per track (both languages + synonyms) so search works
 * whichever language the user types. Display labels live in the i18n catalog
 * (`t.presets.track`); these are for matching only.
 */
export const TRACK_SEARCH_TERMS: Record<RoleTrack, string[]> = {
  legal: ['legal', 'law', 'lawyer', 'attorney', '法律', '律师', '法务'],
  swe: ['software', 'swe', 'ml', 'engineer', 'tech', '软件', '工程师', '机器学习', '科技'],
  medicine: ['medicine', 'medical', 'doctor', 'physician', 'md', '医', '医学', '医生', '医疗'],
  finance: ['finance', 'banking', 'consulting', 'quant', '金融', '投行', '咨询', '量化'],
};

export type RolePreset = {
  /** Stable id for React keys. */
  id: string;
  track: RoleTrack;
  /** Human-readable title shown in the picker (English). */
  title: string;
  /** Title in 简体中文. */
  titleZh: string;
  /** Annual base salary in USD (pre-bonus, pre-equity, pre-tax). */
  baseSalary: number;
  /** Within-stage annual raise on base, nominal %. */
  annualRaisePct: number;
  /** Bonus as % of base. */
  bonusPct: number;
  /** Annual equity / RSU grant value in USD. 0 for cash-only roles. */
  annualEquity: number;
  /** One-line context shown under the title (English). */
  notes: string;
  /** Context line in 简体中文. */
  notesZh: string;
};

export const ROLE_PRESETS: readonly RolePreset[] = [
  // ---------------- Legal (mostly cash comp) ----------------
  {
    id: 'biglaw-assoc-y1',
    track: 'legal',
    title: 'BigLaw Associate (Year 1)',
    titleZh: '顶级律所律师(第 1 年)',
    baseSalary: 225_000,
    annualRaisePct: 0,
    bonusPct: 25,
    annualEquity: 0,
    notes: 'Lockstep first-year base at top-paying firms; cash bonus on top.',
    notesZh: '顶级律所一年级统一起薪,另有现金奖金。',
  },
  {
    id: 'biglaw-assoc-mid',
    track: 'legal',
    title: 'BigLaw Associate (Years 3–5)',
    titleZh: '顶级律所律师(3–5 年)',
    baseSalary: 280_000,
    annualRaisePct: 8,
    bonusPct: 35,
    annualEquity: 0,
    notes: 'Mid-class-year lockstep; bonus scales with class.',
    notesZh: '中期统一薪级,奖金随年级递增。',
  },
  {
    id: 'biglaw-senior-assoc',
    track: 'legal',
    title: 'BigLaw Senior Associate (Years 6–8)',
    titleZh: '顶级律所高级律师(6–8 年)',
    baseSalary: 390_000,
    annualRaisePct: 5,
    bonusPct: 45,
    annualEquity: 0,
    notes: 'Top-of-scale associates at top-paying firms.',
    notesZh: '顶薪律所接近薪级顶端的资深律师。',
  },
  {
    id: 'biglaw-counsel',
    track: 'legal',
    title: 'BigLaw Counsel / Of Counsel',
    titleZh: '顶级律所顾问律师(Counsel)',
    baseSalary: 450_000,
    annualRaisePct: 3,
    bonusPct: 40,
    annualEquity: 0,
    notes: 'Non-partner-track senior role; flatter curve.',
    notesZh: '非合伙人路径的资深职位,增长较平缓。',
  },
  {
    id: 'biglaw-partner',
    track: 'legal',
    title: 'BigLaw Equity Partner',
    titleZh: '顶级律所权益合伙人',
    baseSalary: 1_000_000,
    annualRaisePct: 5,
    bonusPct: 100,
    annualEquity: 0,
    notes: 'Highly variable; midpoint guess. Real number depends on firm + book of business.',
    notesZh: '差异极大,此为中位估算;实际取决于律所与案源。',
  },
  {
    id: 'inhouse-counsel',
    track: 'legal',
    title: 'In-house Counsel (mid-level)',
    titleZh: '企业内部法务(中级)',
    baseSalary: 220_000,
    annualRaisePct: 4,
    bonusPct: 15,
    annualEquity: 20_000,
    notes: 'Corporate legal, mid-career; some equity at tech companies.',
    notesZh: '科技公司企业法务,中期,含少量股权。',
  },
  {
    id: 'inhouse-senior',
    track: 'legal',
    title: 'Senior In-house Counsel',
    titleZh: '高级企业内部法务',
    baseSalary: 320_000,
    annualRaisePct: 4,
    bonusPct: 25,
    annualEquity: 60_000,
    notes: 'Director-level in-house; meaningful equity at tech companies.',
    notesZh: '总监级内部法务,科技公司股权可观。',
  },
  {
    id: 'general-counsel',
    track: 'legal',
    title: 'General Counsel',
    titleZh: '首席法务官(GC)',
    baseSalary: 500_000,
    annualRaisePct: 3,
    bonusPct: 50,
    annualEquity: 150_000,
    notes: 'Chief legal officer at a mid-size company; equity a real slice of comp.',
    notesZh: '中型公司首席法务,股权是薪酬的重要部分。',
  },
  {
    id: 'gov-attorney',
    track: 'legal',
    title: 'Federal Government Attorney',
    titleZh: '联邦政府律师',
    baseSalary: 130_000,
    annualRaisePct: 3,
    bonusPct: 0,
    annualEquity: 0,
    notes: 'Mid-career GS-13 to GS-14 federal; no bonus/equity typical.',
    notesZh: '联邦 GS-13 至 GS-14 中期,通常无奖金/股权。',
  },
  {
    id: 'public-interest',
    track: 'legal',
    title: 'Public-interest Attorney',
    titleZh: '公益律师',
    baseSalary: 75_000,
    annualRaisePct: 3,
    bonusPct: 0,
    annualEquity: 0,
    notes: 'Nonprofit / legal-aid / DA office entry-mid level.',
    notesZh: '非营利/法律援助/地检署入门到中级。',
  },

  // ---------------- Software / ML (equity-heavy) ----------------
  {
    id: 'swe-junior',
    track: 'swe',
    title: 'Junior SWE (L3 / SDE I)',
    titleZh: '初级软件工程师(L3 / SDE I)',
    baseSalary: 145_000,
    annualRaisePct: 6,
    bonusPct: 15,
    annualEquity: 40_000,
    notes: 'New-grad big-tech; equity already a big chunk of total comp.',
    notesZh: '应届大厂,股权已占总包很大一块。',
  },
  {
    id: 'swe-mid',
    track: 'swe',
    title: 'Mid SWE (L4 / SDE II)',
    titleZh: '中级软件工程师(L4 / SDE II)',
    baseSalary: 180_000,
    annualRaisePct: 5,
    bonusPct: 20,
    annualEquity: 90_000,
    notes: '2–4 yrs at a top-paying tech employer; equity ≈ half of base.',
    notesZh: '大厂 2–4 年,股权约为底薪的一半。',
  },
  {
    id: 'swe-senior',
    track: 'swe',
    title: 'Senior SWE (L5)',
    titleZh: '高级软件工程师(L5)',
    baseSalary: 240_000,
    annualRaisePct: 4,
    bonusPct: 25,
    annualEquity: 180_000,
    notes: '5–8 yrs; equity often rivals base at big tech.',
    notesZh: '5–8 年,大厂股权常与底薪相当。',
  },
  {
    id: 'swe-staff',
    track: 'swe',
    title: 'Staff SWE (L6)',
    titleZh: '资深软件工程师(Staff L6)',
    baseSalary: 320_000,
    annualRaisePct: 4,
    bonusPct: 30,
    annualEquity: 350_000,
    notes: 'Senior IC; total comp is equity-dominated.',
    notesZh: '资深个人贡献者,总包以股权为主。',
  },
  {
    id: 'swe-principal',
    track: 'swe',
    title: 'Principal SWE (L7)',
    titleZh: '首席软件工程师(Principal L7)',
    baseSalary: 420_000,
    annualRaisePct: 4,
    bonusPct: 35,
    annualEquity: 600_000,
    notes: 'Top IC track; rare and highly variable, mostly equity.',
    notesZh: '顶级 IC,稀少且差异大,以股权为主。',
  },
  {
    id: 'em-manager',
    track: 'swe',
    title: 'Engineering Manager (M1)',
    titleZh: '工程经理(M1)',
    baseSalary: 260_000,
    annualRaisePct: 5,
    bonusPct: 25,
    annualEquity: 200_000,
    notes: 'First-line manager at a top-paying tech employer.',
    notesZh: '大厂一线工程经理。',
  },
  {
    id: 'em-senior',
    track: 'swe',
    title: 'Senior EM / Director (M2)',
    titleZh: '高级工程经理 / 总监(M2)',
    baseSalary: 340_000,
    annualRaisePct: 4,
    bonusPct: 30,
    annualEquity: 400_000,
    notes: 'Multi-team or director-level org; equity-heavy.',
    notesZh: '多团队或总监级组织,股权占比高。',
  },
  {
    id: 'mle-mid',
    track: 'swe',
    title: 'ML Engineer (mid)',
    titleZh: '机器学习工程师(中级)',
    baseSalary: 200_000,
    annualRaisePct: 6,
    bonusPct: 20,
    annualEquity: 120_000,
    notes: 'Applied ML/MLE at a big-tech company.',
    notesZh: '大厂应用 ML / MLE。',
  },
  {
    id: 'mle-senior',
    track: 'swe',
    title: 'Senior ML Engineer',
    titleZh: '高级机器学习工程师',
    baseSalary: 280_000,
    annualRaisePct: 5,
    bonusPct: 25,
    annualEquity: 250_000,
    notes: 'Senior applied-ML IC; equity a large share.',
    notesZh: '资深应用 ML 个人贡献者,股权占比大。',
  },
  {
    id: 'res-engineer',
    track: 'swe',
    title: 'Research Engineer (frontier labs)',
    titleZh: '研究工程师(前沿实验室)',
    baseSalary: 300_000,
    annualRaisePct: 5,
    bonusPct: 15,
    annualEquity: 500_000,
    notes: 'AI lab; comp is dominated by equity — the "heavily on stock" case.',
    notesZh: 'AI 实验室,薪酬以股权为主——典型的「重仓股票」情形。',
  },
  {
    id: 'res-scientist',
    track: 'swe',
    title: 'Research Scientist (PhD, frontier labs)',
    titleZh: '研究科学家(博士,前沿实验室)',
    baseSalary: 350_000,
    annualRaisePct: 4,
    bonusPct: 15,
    annualEquity: 800_000,
    notes: 'Sr. research scientist at an AI lab; equity often dwarfs cash.',
    notesZh: 'AI 实验室资深研究科学家,股权常远超现金。',
  },
  {
    id: 'pm-mid',
    track: 'swe',
    title: 'Product Manager (L5)',
    titleZh: '产品经理(L5)',
    baseSalary: 190_000,
    annualRaisePct: 5,
    bonusPct: 20,
    annualEquity: 130_000,
    notes: 'Mid-level PM at a big-tech company; equity a real slice.',
    notesZh: '大厂中级产品经理,股权占比可观。',
  },
  {
    id: 'pm-senior',
    track: 'swe',
    title: 'Senior Product Manager',
    titleZh: '高级产品经理',
    baseSalary: 250_000,
    annualRaisePct: 4,
    bonusPct: 25,
    annualEquity: 250_000,
    notes: 'Senior/principal PM; equity rivals base.',
    notesZh: '高级/首席产品经理,股权与底薪相当。',
  },
  {
    id: 'ds-mid',
    track: 'swe',
    title: 'Data Scientist (mid)',
    titleZh: '数据科学家(中级)',
    baseSalary: 190_000,
    annualRaisePct: 5,
    bonusPct: 15,
    annualEquity: 110_000,
    notes: 'Product/analytics DS at a big-tech company.',
    notesZh: '大厂产品/分析方向数据科学家。',
  },
  {
    id: 'ds-senior',
    track: 'swe',
    title: 'Senior Data Scientist',
    titleZh: '高级数据科学家',
    baseSalary: 260_000,
    annualRaisePct: 4,
    bonusPct: 20,
    annualEquity: 230_000,
    notes: 'Senior DS/ML-adjacent IC; equity a large share.',
    notesZh: '资深数据科学家,股权占比大。',
  },

  // ---------------- Medicine (base + small bonus, ~no equity) ----------------
  {
    id: 'med-resident',
    track: 'medicine',
    title: 'Resident / Fellow',
    titleZh: '住院医师 / 专科培训',
    baseSalary: 65_000,
    annualRaisePct: 3,
    bonusPct: 0,
    annualEquity: 0,
    notes: 'Training years; low pay, typically 3–7 years before attending.',
    notesZh: '培训阶段,薪资较低,通常主治前需 3–7 年。',
  },
  {
    id: 'med-np-pa',
    track: 'medicine',
    title: 'Nurse Practitioner / PA',
    titleZh: '执业护士 / 医师助理(NP/PA)',
    baseSalary: 125_000,
    annualRaisePct: 2,
    bonusPct: 5,
    annualEquity: 0,
    notes: 'Advanced-practice clinician; not an MD.',
    notesZh: '高级执业临床人员,非医学博士。',
  },
  {
    id: 'med-primary-care',
    track: 'medicine',
    title: 'Primary Care Physician',
    titleZh: '全科 / 家庭医学医师',
    baseSalary: 250_000,
    annualRaisePct: 2,
    bonusPct: 10,
    annualEquity: 0,
    notes: 'Family / internal medicine, employed; bonus is productivity-based.',
    notesZh: '家庭医学 / 内科,受雇执业;奖金多与工作量挂钩。',
  },
  {
    id: 'med-pediatrician',
    track: 'medicine',
    title: 'Pediatrician',
    titleZh: '儿科医师',
    baseSalary: 235_000,
    annualRaisePct: 2,
    bonusPct: 8,
    annualEquity: 0,
    notes: 'Among the lower-paid specialties despite long training.',
    notesZh: '培训漫长,但属薪酬较低的专科之一。',
  },
  {
    id: 'med-psychiatrist',
    track: 'medicine',
    title: 'Psychiatrist',
    titleZh: '精神科医师',
    baseSalary: 285_000,
    annualRaisePct: 2,
    bonusPct: 8,
    annualEquity: 0,
    notes: 'Strong demand; telehealth/private practice can pay more.',
    notesZh: '需求强劲;远程医疗 / 私人执业可更高。',
  },
  {
    id: 'med-hospitalist',
    track: 'medicine',
    title: 'Hospitalist',
    titleZh: '医院主治医师(Hospitalist)',
    baseSalary: 300_000,
    annualRaisePct: 2,
    bonusPct: 10,
    annualEquity: 0,
    notes: 'Inpatient internal medicine; shift-based.',
    notesZh: '住院部内科,按班次工作。',
  },
  {
    id: 'med-emergency',
    track: 'medicine',
    title: 'Emergency Medicine',
    titleZh: '急诊科医师',
    baseSalary: 350_000,
    annualRaisePct: 2,
    bonusPct: 10,
    annualEquity: 0,
    notes: 'Shift work; pay per hour is high but hours vary.',
    notesZh: '轮班工作;时薪高但工时波动大。',
  },
  {
    id: 'med-anesthesiologist',
    track: 'medicine',
    title: 'Anesthesiologist',
    titleZh: '麻醉科医师',
    baseSalary: 400_000,
    annualRaisePct: 2,
    bonusPct: 12,
    annualEquity: 0,
    notes: 'One of the higher-paid non-surgical specialties.',
    notesZh: '非手术专科中薪酬较高者之一。',
  },
  {
    id: 'med-radiologist',
    track: 'medicine',
    title: 'Radiologist',
    titleZh: '放射科医师',
    baseSalary: 430_000,
    annualRaisePct: 2,
    bonusPct: 12,
    annualEquity: 0,
    notes: 'High pay; some remote/teleradiology options.',
    notesZh: '薪酬高;部分可远程 / 远程影像诊断。',
  },
  {
    id: 'med-dermatologist',
    track: 'medicine',
    title: 'Dermatologist',
    titleZh: '皮肤科医师',
    baseSalary: 420_000,
    annualRaisePct: 2,
    bonusPct: 10,
    annualEquity: 0,
    notes: 'Lifestyle specialty; private practice can pay well above this.',
    notesZh: '「生活方式」专科;私人执业可远高于此。',
  },
  {
    id: 'med-general-surgeon',
    track: 'medicine',
    title: 'General Surgeon',
    titleZh: '普外科医师',
    baseSalary: 400_000,
    annualRaisePct: 2,
    bonusPct: 12,
    annualEquity: 0,
    notes: 'Surgical specialty; long hours, high liability.',
    notesZh: '外科专科;工时长、责任重。',
  },
  {
    id: 'med-orthopedic-surgeon',
    track: 'medicine',
    title: 'Orthopedic Surgeon',
    titleZh: '骨科医师',
    baseSalary: 560_000,
    annualRaisePct: 2,
    bonusPct: 15,
    annualEquity: 0,
    notes: 'Among the highest-paid specialties.',
    notesZh: '薪酬最高的专科之一。',
  },
  {
    id: 'med-cardiologist',
    track: 'medicine',
    title: 'Cardiologist',
    titleZh: '心脏内科医师',
    baseSalary: 480_000,
    annualRaisePct: 2,
    bonusPct: 12,
    annualEquity: 0,
    notes: 'Interventional cardiology can pay meaningfully more.',
    notesZh: '介入心脏病学可显著更高。',
  },

  // ---------------- Finance / Consulting (cash-bonus-heavy) ----------------
  {
    id: 'fin-ib-analyst',
    track: 'finance',
    title: 'Investment Banking Analyst',
    titleZh: '投行分析师',
    baseSalary: 110_000,
    annualRaisePct: 5,
    bonusPct: 70,
    annualEquity: 0,
    notes: '1–3 yrs; bonus can rival base. Brutal hours.',
    notesZh: '1–3 年;奖金可与底薪相当,工时极长。',
  },
  {
    id: 'fin-ib-associate',
    track: 'finance',
    title: 'Investment Banking Associate',
    titleZh: '投行 Associate',
    baseSalary: 175_000,
    annualRaisePct: 5,
    bonusPct: 90,
    annualEquity: 0,
    notes: 'Post-MBA or promoted analyst; large cash bonus.',
    notesZh: 'MBA 后或分析师晋升;现金奖金丰厚。',
  },
  {
    id: 'fin-ib-vp',
    track: 'finance',
    title: 'Investment Banking VP',
    titleZh: '投行副总裁(VP)',
    baseSalary: 250_000,
    annualRaisePct: 4,
    bonusPct: 120,
    annualEquity: 0,
    notes: 'Deal execution + client management; bonus-heavy.',
    notesZh: '负责交易执行与客户管理;奖金占比大。',
  },
  {
    id: 'fin-pe-associate',
    track: 'finance',
    title: 'Private Equity Associate',
    titleZh: '私募股权 Associate',
    baseSalary: 175_000,
    annualRaisePct: 5,
    bonusPct: 100,
    annualEquity: 0,
    notes: 'Carry NOT modeled — the real upside is carried interest.',
    notesZh: '未计入 carry——真正的上行来自附带权益(carry)。',
  },
  {
    id: 'fin-hedge-analyst',
    track: 'finance',
    title: 'Hedge Fund Analyst',
    titleZh: '对冲基金分析师',
    baseSalary: 200_000,
    annualRaisePct: 4,
    bonusPct: 150,
    annualEquity: 0,
    notes: 'Highly variable, performance-linked; can swing hard.',
    notesZh: '差异极大、与业绩挂钩,波动很大。',
  },
  {
    id: 'fin-quant',
    track: 'finance',
    title: 'Quant Researcher',
    titleZh: '量化研究员',
    baseSalary: 250_000,
    annualRaisePct: 4,
    bonusPct: 100,
    annualEquity: 0,
    notes: 'Top quant funds; some comp is deferred / fund units.',
    notesZh: '顶级量化基金;部分薪酬为递延 / 基金份额。',
  },
  {
    id: 'fin-mbb-consultant',
    track: 'finance',
    title: 'Management Consultant (MBB, post-MBA)',
    titleZh: '管理咨询顾问(MBB,MBA 后)',
    baseSalary: 200_000,
    annualRaisePct: 5,
    bonusPct: 25,
    annualEquity: 0,
    notes: 'McKinsey/Bain/BCG post-MBA associate.',
    notesZh: '麦肯锡 / 贝恩 / BCG 的 MBA 后顾问。',
  },
  {
    id: 'fin-consult-analyst',
    track: 'finance',
    title: 'Consulting Analyst (MBB, undergrad)',
    titleZh: '咨询分析师(MBB,本科)',
    baseSalary: 112_000,
    annualRaisePct: 6,
    bonusPct: 15,
    annualEquity: 0,
    notes: 'Entry-level strategy consulting.',
    notesZh: '入门级战略咨询。',
  },
];

/**
 * Case-insensitive search across title (EN + 中文), track (code + synonyms in
 * both languages), and notes (EN + 中文). Empty query returns all roles.
 * Caller is responsible for display order / grouping.
 */
export function searchRolePresets(query: string): RolePreset[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...ROLE_PRESETS];
  return ROLE_PRESETS.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.titleZh.includes(q) ||
      r.track.toLowerCase().includes(q) ||
      TRACK_LABELS[r.track].toLowerCase().includes(q) ||
      TRACK_SEARCH_TERMS[r.track].some((term) => term.toLowerCase().includes(q)) ||
      r.notes.toLowerCase().includes(q) ||
      r.notesZh.includes(q),
  );
}
