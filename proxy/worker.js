/**
 * INCANT 주문 판정 프록시 — Cloudflare Worker
 * 역할: ① Gemini API 키 은닉 ② 레이트리밋 ③ CORS ④ 프롬프트 서버측 고정
 *
 * 배포: proxy/README.md 참조 (wrangler + GEMINI_API_KEY 시크릿)
 * 클라이언트는 { text } 만 보내고, 판정 프롬프트·스키마는 여기서 강제한다.
 * (프롬프트를 클라이언트에 두면 조작 가능 — 서버측 고정이 원칙)
 */
import {
  ensureExplicitCircularMoveChoreography,
  ensureRepeatedFootstepChoreography,
  expandRapidFireSingleSpell,
  fillExplicitLongMoveDistances,
  hasDamageFormSpellPlan,
  hasMoveWithoutFormSpellPlan,
  hasMoveSpellPlan,
  hasUnsupportedForm,
  isWaitOnlySpellPlan,
  isUnexpectedAtomicChangeCast,
  normalizeJudgeOutput,
  promoteCastSpellToAtomicPlan,
  removeDamageFormBehaviors,
  removeNonDamageFormBehaviors,
  repairExtraMoveBraceJson,
  repairMalformedDistanceKeyJson,
} from './judge-output.js';

const GEMINI_URL =
  // 모델 핀 고정(2026-07-22): `-latest` 자동 갱신으로 요청 규격이 바뀌는 문제 방지.
  // Gemini 3.5부터 temperature/thinkingBudget가 폐기되어 아래 요청에서도 제거했다.
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

// 공급자 프로젝트 할당량과 별개인 앱 자체 간이 보호막.
// IP별·Worker 인스턴스별 인메모리 제한이므로 프로젝트 전체 쿼터를 보장하지는 않는다.
const RATE_LIMIT_PER_MIN = 15;
const hits = new Map();
const KNOWN_NONSENSE = new Set(['ㅁㄴㅇㄹ', 'asdf', 'qwer', 'zxcv', 'ㅋㅋㅋ', 'ㅎㅎㅎ']);

function isObviousNonsense(text) {
  const compact = text.trim().toLowerCase().replace(/\s/g, '');
  if (compact.length === 0 || KNOWN_NONSENSE.has(compact)) return true;
  if (!/[가-힣a-z]/i.test(compact)) return true;
  return /^(.)\1{2,}$/u.test(compact);
}

function isPossessiveNonPlayerMotion(text) {
  const match = text.match(/([가-힣A-Za-z]+)의\s*(낙화|낙하|추락|도주|회귀|역류)/u);
  if (!match) return false;
  return !['나', '내', '우리', '시전자'].includes(match[1]);
}

function isCompletedAttackExit(text) {
  return /(베어|찌르|때리|공격|참격|칼날).*(없|잔상|사라|빠져나|이탈)/u.test(text);
}

function isNonAttackingMount(text) {
  const hasMount = /(등에\s*(올라|타고)|타고\s*함께)/u.test(text);
  const hasAttack = /(물어|들이받|베어|찌르|때리|공격|참격|꿰뚫|휩쓸)/u.test(text);
  return hasMount && !hasAttack;
}

function parseJudgeJson(json) {
  return JSON.parse(repairMalformedDistanceKeyJson(repairExtraMoveBraceJson(json)));
}

const JUDGE_PROMPT = `당신은 자유 텍스트 마법 게임의 의미 판정관이다. 반드시 JSON 하나만 출력한다.

다음 순서를 지켜 판단한다.
1. 입력 언어와 표현의 실제 의미를 파악한다. 외래어와 비유도 번역해 이해한다.
2. disposition을 결정한다.
   - cast: 의미가 있는 모든 문장. 마법 단어가 없어도 창의적인 약한 효용 주문으로 번역한다.
   - 완결된 동작·자연현상·전투 장면을 풀어 쓴 서술문도 의미 있는 cast다. 주문명 형식이 아니라는 이유로 fizzle하지 않는다.
   - 신체·감정·시간을 비유한 제목도 문법적으로 의미가 있으면 cast다. 수량·반복·"동안" 같은 시간 관계가 있으면 그 관계를 해석하며 fizzle하지 않는다.
   - fizzle: "ㅁㄴㅇㄹ", "asdf"처럼 의미 없는 키보드 매시만 해당한다.
   - blocked: 욕설, 혐오, 노골적 유해 표현 등 부적절한 입력만 해당한다.
3. cast라면 effect와 target을 먼저 결정한 뒤 element와 form을 시각적 은유로 고른다.
   - effect: damage|heal|shield|buff|control|summon
   - target: enemy|self|area
   - effect를 고르기 전에 입력의 **전투 목적과 공격성**을 판정한다. 치유·보호·강화·속박·정지·구조·소환 목적이 명시되거나 강하게 함축되면 해당 비공격 effect를 우선 보존한다.
   - 적대적 주체 또는 절단·관통·충돌·파괴·폭발·추락·포식·사냥·응징처럼 직접적인 위해가 명시되거나 강하게 함축되면 damage를 선택한다. 공격 이미지를 control이나 buff로 안전하게 약화하지 않는다.
   - 목적이 생략된 추상적 player 이동은 궤적·접촉·도착에서 파생한 damage 또는 공격적 control을 선택한다. 명시적 강화 목적 없이 속도·전이·도착 자체만 말한 입력에는 shield|buff를 선택하지 않는다. 단, 회피·탈출·은폐·안전 확보·구조·치유 목적이면 shield|buff|heal을 유지하며 damage를 추가하지 않는다.
   - “시적인 표현이다”, “player move가 있다”는 사실만으로 damage를 강제하지 않는다. 입력의 적대성·목적·결과가 우선이다.
   - element는 명시 원소를 최우선으로 보존한다. 명시가 없으면 존재·현상의 **정체성**을 주원소로, 행동·운동·환경을 설명하는 원소를 보조 원소로 해석할 수 있다.
   - 두 원소가 각기 다른 의미 역할을 가지면 단순 element_secondary 태그 하나보다 별도 form·sequence 또는 병렬 form으로 교대·융합·변화·충돌·수렴 관계를 보여주는 데 약한 우선권을 준다.
   - 예: 화염 존재가 날개짓·상승기류로 비행하면 fire는 정체성, wind는 행동 역할이다. 날개·비행·활공이 별도 사건 또는 핵심 행동이고 다른 이동 매질이 명시되지 않았다면 wind를 보조 원소나 별도 form으로 보존한다. 반대로 순수 번개 사슬처럼 단일 원소로 의미가 완결되면 다양성을 위해 보조 원소를 창작하지 않는다.
   - "배고프다", "피곤하다"처럼 상태를 말하는 문장은 heal 또는 buff/self로 해석한다.
   - "나를 지켜줘"는 shield/self, "숲의 분노"는 damage 또는 control/area로 해석한다.
   - "라이트닝 스톰"과 "lightning storm"은 번개 폭풍의 동일한 의미로 해석하되, storm은 의미 단어일 뿐 form enum이 아니다. 효과에 따라 지원 form rain|zone|nova 중 하나로 번역하고 form:"storm"은 절대 출력하지 않는다.
   - 근접에서 **베거나 휘두르는 동작**(칼·도끼·발톱·횡베기·참격 등)은 form=slash로 고른다. 멀리 던지거나 쏘는 투사체(bolt)·광선(beam)과는 구분한다.
   - **직선 공격은 bolt와 beam으로 갈린다.** 하나의 대상에 날아가 맞고 끝나는 **단발 탄체**(구슬·화살·탄환·던진 창)는 bolt다. **경로 위의 것을 관통해 지나가는 것**(꿰뚫는다·관통·일직선으로 뚫고·레이저·광선·빛줄기)은 beam이다. 게임에서 beam은 실제로 직선상의 적을 모두 타격하므로, 관통 묘사에 bolt를 고르면 플레이어가 말한 것이 사라진다.
4. power와 cost를 정한다.
   - 구체적·창의적·서사적인 묘사: power 60~100
   - 단순한 마법 표현: power 30~50
   - 마법과 무관하지만 의미 있는 문장: power 15~40
   - 표기 언어(한국어·외래어·영어)는 power에 영향을 주지 않는다. 번역했을 때 의미와 구체성이 같으면 power도 동일해야 한다.
   - 창의성 가점은 표현의 구체성·서사성에만 근거한다. 단순 마법 단어에는 가점하지 않는다.
   - cost는 power의 0.5~0.7배이며 1~100이다.
5. effect가 summon인 주문에 한해, 소환수 움직임 묘사를 behavior(움직임 프로그램)로 설계한다.
   summon이 아니거나 움직임 묘사가 없으면 behavior를 넣지 않는다(기본 행동으로 폴백).
   - 움직임 부품(kind, 이 6개만): orbit(플레이어 주위 선회)·chase(표적 추적)·dash(표적으로 돌진)·zigzag(갈지자로 접근)·hold(제자리 대기)·retreat(표적 반대로 후퇴)
   - "A 하다가 B" 순차 묘사는 steps 순서로 표현한다. 예: "지그재그로 접근하다 돌진" → [zigzag, dash]
   - 수치는 묘사 강도에 맞게: seconds 1~6, speed 1~460, orbit의 radius 1~150, zigzag의 amplitude 1~100. steps는 최대 6개.
   - loop: 계속 되풀이하는 움직임이면 true, 한 번의 시퀀스면 false.
6. form이 wall인 주문에 한해, 벽의 모양 묘사가 있으면 shape로 설계한다.
   form이 wall이 아니거나 모양 묘사가 없으면 shape를 넣지 않는다(기본 원호로 폴백).
   - 형상 부품(kind, 이 6개만): arc(원호·기본)·line(직선)·zigzag(갈지자)·wave(물결)·ring(닫힌 원, 둘러싸기)·polygon(다각형)
   - zigzag·wave는 amplitude 1~100(굴곡 세기), polygon은 sides 3~8(삼각형=3).
   - 예: "지그재그로" → zigzag / "원을 그리며 둘러싸라" → ring / "삼각형으로" → polygon(sides 3)
7. 모든 cast는 **spell_plan만** 출력한다. 단일 효과와 복합 효과를 서로 다른 출력 종류로 나누지 않는다. 먼저 입력에서 명시되거나 강하게 함축된 사건과 그 관계(이동·순서·동시·반복·지연·변화·인과)를 파악한다.
   - 사건이 하나이고 하나의 form으로 의미가 완결되는 닫힌 단일 사건도 spell_plan으로 낸다. 이때 sequences 1개, form behavior 1개인 **원자 plan**으로 구성하고 spell은 생략한다.
   - 서로 구분되는 사건이 둘 이상이거나 이동·동시성·반복·지연·변화의 가능성이 자연스럽게 읽히면 이를 적극적으로 화면에 펼친 **복합 plan**을 우선한다.
   - 이동·순서·반복·동시·변화가 문장에 명시되지 않았다는 이유만으로 원자 plan을 고르지 않는다. 시적·함축적·신화적 이미지가 그러한 과정이나 관계를 자연스럽게 허용하는지 먼저 검토한다.
   - 단, 단계 수를 늘리는 것 자체가 목적은 아니다. 확장한 각 사건은 입력의 핵심 이미지·동사·관계에 근거해야 하며, 근거 없는 이동·공격·치유·보호·소환을 창작하지 않는다.
   - 하나의 물체도 형성→분열→폭발처럼 여러 사건을 가질 수 있다. 반대로 여러 물체도 같은 순간 같은 역할이면 한 단계의 병렬 behaviors로 충분하다.
   - 과정·행동을 뜻하는 말(비행·활공·질주·추격·춤·무도·왈츠·순례·선회·도약·돌진·기상·낙하·폐막·봉합·사냥·역류·합창·각성 등)은 제목형이어도 사건 신호다. 그 단어를 단일 form 하나로는 보여줄 수 없을 때, 의미에 필수적인 최소 2~4개 사건을 추론한다.
   - 갈라짐·분열·개화·변신·융합·붕괴·부활·각성처럼 **상태가 달라지는 과정어**는 시작과 결과가 구분되는 강한 변화 신호다. 지원 form 하나가 변화 전후를 모두 실제 화면에 보여주지는 못하므로 원자 plan으로 축약하지 말고, 최소 두 form 또는 형성→결과의 두 사건으로 표현한다.
   - 비행·활공·질주·추격·순례·선회·도약·돌진·무도·왈츠처럼 **공간 이동 과정 자체**가 핵심이고 player가 그 이동을 체현할 수 있는 해석이면, form의 속도만 높인 단일 spell보다 player move+form의 spell_plan에 약한 우선권을 준다. 이동 결과뿐 아니라 이동 과정이 화면에 남아야 한다.
   - 제목형 "[이미지]의 비행·활공·추격·순례·선회·무도·왈츠"는 소유격의 이미지를 자동으로 별도 주체로 확정하지 않는다. 소환·발사·관찰·보냄이 명시되지 않고 지형·파도·유성·투사체도 아니라면 player가 그 이미지를 체현하는 spell_plan을 기본으로 고른다.
   - 체현 이동에는 반드시 입력 안의 명시적 이동 과정어가 필요하다. 날개·깃털·새·별·빛 같은 이동 가능한 이미지나 존재 이름만 있고 비행·활공·질주·추격·순례·선회·도약·돌진·무도·왈츠가 없으면 player move를 만들지 않는다.
   - 형성·이동·전개·변화·결말 중 역할이 다른 사건이 둘 이상 자연스럽게 읽히면 복합 구성에 약한 우선권을 준다. 단일로 축약하기 전에 입력의 핵심 동사와 결과가 모두 화면에 남는지 확인한다.
   - 공격 뒤 이탈, 파괴 뒤 재생, 등장 뒤 행동처럼 앞뒤 사건이 서로 다른 역할이면 한쪽을 buff나 flavor로 대체하지 않는다. 선택한 각 behavior가 어떤 입력 사건을 담당하는지 내부적으로 대응시킨다.
   - 대비·결합을 뜻하는 이미지(일식, 융합, 교차, 변신, 여러 원소의 합주 등)는 원소 하나가 아니라 관계를 표현한다.
   - 단순 발사·베기·폭발처럼 한 form 자체가 동작 전체를 충분히 보여주고 추가 과정의 근거가 희박하면 원자 plan이다.
   - 입력에 없는 사건을 오직 시퀀스 모양을 만들기 위해 추가하지 않는다. 추론한 각 sequence와 behavior는 입력의 핵심 이미지·동사·관계 중 하나를 설명할 수 있어야 한다.
   - 구성을 마친 뒤 wait을 제외한 실행 behavior가 form 하나뿐이고 별도 이동·반복·전환·병렬 관계가 없다면 sequences 1개·form 1개의 원자 plan을 유지한다. spell로 환원하지 않는다.

   **안무 구조**
   - sequences는 시간 순서다(최대 10). 같은 순간에 시작하는 사건은 같은 sequence의 behaviors로 병렬 배치한다(최대 5).
   - 일반 sequence는 앞 연출의 꼬리와 다음 연출이 일부 겹친다. 정확한 간격이 의미이면 wait-only sequence를 사용한다.
   - behavior type은 form|move|wait뿐이다. form은 마법 효과, move는 플레이어 본체 이동, wait은 명시적인 박자·준비·지연이다.
   - form은 bolt|beam|slash|wave|nova|rain|wall|cage|orbit|summon|buff|zone|chain 중 하나만 사용한다. storm 등 비슷한 새 이름을 만들지 않는다.
   - move는 플레이어의 돌진·도약·후퇴·점멸·공간 전이·답보·도주·보행, 또는 플레이어가 별·새·빛 같은 이미지가 되어 비행·춤·추격·순례하는 **체현 이동**이 핵심일 때 쓴다. 투사체·파도·유성·명시된 소환수 자체의 이동을 move로 표현하지 않는다.
   - 제목형에서 비행·활공·질주·추격·순례·선회·도약·돌진·무도·왈츠가 핵심이고 소환·발사·관찰 대상으로 별도 이동 주체가 명시되지 않았다면 시전자가 그 움직임을 체현하는 해석을 우선 검토한다. 생물·신화적 존재인지보다 이동 과정이 핵심인지가 우선이다.
   - 산·산맥·화산·대지·숲·바다 같은 지형의 기상·각성·융기·붕괴와 파도·해일·폭풍·유성·투사체의 이동은 체현 후보가 아니다. 움직이는 주체를 form으로 표현하고 player move를 만들지 않는다. 의인화된 이름이나 장엄한 제목이라는 이유만으로 지형을 시전자의 몸으로 바꾸지 않는다.
   - 전이·점멸·도약·답보·질주·대시·보행처럼 위치 변화 자체를 뜻하는 기술명은 주어가 생략된 제목형이어도 player move로 해석한다. 명시적인 자기 강화가 없으면 이를 buff나 shield로 바꾸지 않는다.
   - 이동 주체는 문법 관계까지 보고 결정한다. "X의 역류·회귀·낙하"처럼 현상이나 대상이 소유격으로 행동을 수식하면 X 자체의 움직임이며 player move가 아니다. 반대로 "X를 거슬러·헤치며·뚫고"처럼 환경을 목적어로 통과하는 표현은 시전자의 이동이 생략된 것으로 볼 수 있다.
   - 시전자가 움직이는 동시에 유성우·파도·불길 같은 환경을 통과하거나 맞서는 장면이면 move와 해당 환경 form을 같은 sequence에 병렬로 둔다. 환경의 진행 방향만 반대가 되는 경우에는 form의 형상·속도·순서로 표현하고 player move를 만들지 않는다.
   - 별·투사체 같은 마법 형상이 명백히 별도 주체로 도망치거나 비행하는 장면은 bolt|orbit|rain|wave 같은 form의 속도와 궤적으로 표현한다. 반면 신화적 존재·천체 이미지의 제목형 비행·춤은 명시적 소환이 없다면 체현 이동을 우선 검토한다. 어느 쪽이든 근거 없이 self buff로 바꾸지 않는다.
   - 소환된 존재, 깨어난 환경, 그 존재로 체현한 시전자는 서로 다른 주체다. 입력이 허용하는 해석 하나를 고른 뒤 후속 행동까지 같은 주체를 유지한다. summon을 낸 뒤 근거 없이 player move로 바꾸거나, 체현 이동을 정적 self buff로 끝내지 않는다.
   - 현재 게임에서 move는 방향·도착점을 정밀 제어하는 독립 전술 효과가 아니라 유효한 마법 효과를 전달하고 화려하게 만드는 안무다. player move가 있으면 spell_plan 전체에 실행 가능한 form을 하나 이상 두며, move-only 영창은 만들지 않는다.
   - form 최소 하나 조건은 **plan 전체 기준**이다. 기존 공격·제어·보호 form이 이미 있으면 별도 move sequence에 또 form을 붙일 필요가 없다. 특히 공격 후 이탈 move에 입력에 없는 shield·buff를 덧붙이지 않는다.
   - form effect는 damage로 고정하지 않는다. ① 입력에 명시된 효과, ② 입력의 공격성·적대성, ③ 이동이 직접 만드는 결과, ④ 이동 목적과 이미지에 가까운 전투 효용 순으로 damage|control|shield|buff|heal|summon 중 하나를 고른다.
   - 돌진·관통·충돌·베기는 damage, 휩쓸기·밀치기·빙결 흔적은 control 또는 damage, 회피·탈출·은폐·안전 전이는 shield 또는 buff, 질주·비행·부유는 damage|control|buff 중 입력에 맞는 것을 우선 고려한다.
   - 답보는 발을 디디는 반복 이미지가 핵심이므로 명시적인 보호·강화 목적이 없다면 발걸음의 충격·참격·파동을 damage로 표현한다. 단순 기동 buff로 축약하지 않는다.
   - 구조·구원·치유 대상으로의 접근은 heal 또는 shield, 소환수 탑승·동행은 summon을 사용할 수 있다. heal과 summon은 해당 대상·주체가 입력에 드러날 때만 만든다.
   - "바람을 타고/타니", "구름에 실려", "파도에 올라"처럼 시전자가 매개를 타는 표현은 player 이동이다. 뒤에 강화·보호 결과가 있더라도 move를 지우고 단일 buff로 축약하지 않는다.
   - "X의 등에 올라/타고 함께 달린다"처럼 별도 존재 X를 탈것·동행자로 명시하면 X의 summon form을 먼저 만들고 player move를 뒤에 둔다. "적진·전장으로 달린다"는 목적지일 뿐 공격이 아니다. 물기·들이받기·베기·공격 같은 동사가 없으면 summon+move만 두고 damage form을 추가하지 않는다.
   - "대상에게 날아가/달려가 효과를 건넨다"처럼 접근 뒤 전달이 문법적으로 이어지면 move 다음 heal|shield|buff|control form의 순차 사건으로 구성한다.
   - 이동 횟수는 "이동이 강조되는가"로 고정하지 말고 입력의 서로 구분되는 공간 사건과 시각적 리듬으로 정한다. 단순 위치 변화 한 건은 move 한 번이면 충분하지만, 접근·통과·방향 전환·이탈·귀환·착지가 구분되면 각 사건을 별도 move로 보존할 수 있다.
   - 이동 과정 자체가 효과를 전달하거나 한 번의 이동으로 표현의 규모·리듬이 부족하면 자연스러운 두 번째 move를 구성할 수 있다. 단, 횟수를 늘리기 위해 입력에 없는 귀환·방향 전환·공격을 기계적으로 창작하지 않는다.
   - 복수 move를 짧게 쪼개지 않는다. 긴 이동 여러 번도 허용하며 각 구간이 화면에서 명확히 보이게 한다. 같은 방향의 의미 없는 반복보다 방향 전환, 중간 form, 착지, 이탈처럼 목적이 다른 박자를 둔다.
   - "여러/N명의 적 사이를 차례로 튕긴다·오간다·누빈다"는 한 대상에게 가는 move 하나가 아니라 서로 다른 대상 사이의 연속 이동이다. 최소 두 개의 move를 서로 다른 단계에 두고 각 도착의 form 또는 마지막 피날레를 보존한다.
   - "한 바퀴 돈다·원을 그리며 돈다·주위를 선회한다"에서 player가 이동 주체이면 한 방향 move 하나로 축약하지 않는다. 최소 두 방향 구간의 move로 순환 궤적을 보여준다. 별도 현상·소환수만 선회하면 player move를 만들지 않는다.
   - 이동 안무는 의미에 따라 move+form, form→move, move→form, move→form→move, (move+form)→(move+form), move→move→피날레, summon+move→form 중 가장 간결한 구조를 고른다. 문법의 수를 채우는 것이 아니라 입력 사건을 선명하게 보존하는 것이 목표다.
   - 이동 form은 입력과 무관한 투사체나 효과를 덧붙이지 않는다. 이동의 궤적·발걸음·출발점·도착점·접촉·관통·도약·착지 중 입력에 가장 가까운 이미지에서 효용을 파생한다.
   - player 이동 경로 자체의 공격은 slash|beam|wave, 도착·착지는 nova, 지속 흔적은 zone|wave, 보호·강화는 buff|wall을 우선한다. 별도 투사체가 실제로 발사되지 않으면 bolt|orbit|rain으로 이동 경로를 대신하지 않는다.
   - player move가 아닌 치유·보호·강화·고정 제어에는 장식용 move나 damage를 추가하지 않는다.
   - 이동 원소는 ① 입력에 명시된 원소, ② 고정된 이동 이미지 대응 순으로 고른다. 명시 원소가 없으면 섬광·찰나·초고속은 light, 공간 왜곡·사라짐·잔상은 dark, 답보·비행·부유·질주는 wind, 충돌·착지는 earth를 우선한다.
   - move.element와 같은 사건의 form.element_primary는 원칙적으로 같은 주원소를 공유한다. 다만 존재의 정체성과 이동 매질·행동이 서로 다른 원소를 강하게 함축하면 보조 원소 또는 다음 form으로 분리할 수 있다. 의미 역할이 없으면 다양성을 위해 별도 원소를 창작하지 않는다.
   - **이동 영창 강제검사:** 입력이 player의 전이·점멸·순보·답보·질주·도약·대시·보행·부유·사라짐을 뜻하거나, 별도 이동 주체가 명시되지 않은 제목형 비행·활공·추격·순례·선회·무도·왈츠를 player가 체현할 수 있으면 원자 plan으로 축약하지 않는다. player move와 입력 의미에 맞는 form을 모두 포함한다. 회피·보호·강화 목적이 없다면 form effect는 damage 또는 공격적 control이어야 한다. 투사체·파도·유성·명시적 소환수처럼 별도 주체가 분명하면 적용하지 않는다.
   - 이동과 공격이 동시에 일어나면 같은 sequence에 move+form을 병렬 배치한다. 이동을 마친 뒤 공격하면 별도 sequence로 나눈다. 접근 뒤 공격하고 빠져나오면 move→form→move 세 사건을 모두 보존한다.
   - "베어낸·찌른·때린 자리에는 내가 없다/잔상만 남는다"처럼 완료된 공격과 시전자의 부재가 함께 나오면 공격 form 뒤 player move가 일어난 순차 사건이다. 은신 분위기가 있더라도 공격이나 위치 변화를 self buff 하나로 지우지 않는다.
   - wait은 반드시 혼자 있는 sequence로 낸다. 입력에 박자·간격·잠시 뒤·지연이 명시되거나 핵심 관계로 강하게 함축될 때만 사용한다. 단계 수를 늘리거나 여러 병렬 묶음을 나누기 위한 대기는 금지한다.
   - wait은 사건이 아니라 사건 사이 간격이다. "N번"이 명시되면 wait을 제외한 실제 move 또는 form이 N개 있어야 하며, wait으로 반복 사건을 대체하지 않는다.
   - **비이동 공격 시간 안무:** "연사·속사·연발·잇달아"는 개별 공격 사이의 짧은 시간차가 핵심인 강한 반복 신호다. 원자 plan이나 rain 하나로 축약하지 말고 form→wait→form 리듬으로 표현한다.
   - 연사형 입력에 횟수가 없으면 동일 의미의 form 2~3개와 그 사이 wait을 둔다. "N발·N번·N차례"가 명시되면 실제 form을 정확히 N개, 그 사이 wait을 N-1개 둔다. wait은 반드시 혼자 있는 sequence다.
   - 연사 form들은 하나의 plan.power를 powerWeight로 나눠 가지며 횟수만큼 총 위력을 복제하지 않는다. 명시된 마무리나 마지막 폭발이 있으면 마지막 form만 weight·size·tuning을 조금 높일 수 있다.
   - "일제사격·동시에·한꺼번에"는 시간차가 아니라 동시성이므로 같은 sequence의 병렬 form 또는 밀집 rain 하나로 표현하고 wait을 넣지 않는다.
   - "난사·퍼붓는다·소나기"는 개별 발의 박자가 핵심이면 반복 form, 밀도·영역이 핵심이면 rain 하나를 고른다. 단어 하나만으로 무조건 wait을 강제하지 않는다.
   - "계속 유지·지속되는 광선·장판"은 긴 beam|zone 하나인 원자 plan이며 반복 form이나 wait을 만들지 않는다. "단 한 발·일격"도 form 하나인 원자 plan을 유지한다.

   **의미 보존 우선순위**
   - 명시·강암시된 원소, 효과 목적, 플레이어 이동 방향을 보존한다.
   - 공격성이 강하게 함축된 입력은 damage를 우선 검토하되 명시·강암시된 치유·보호·강화·제어·소환 목적을 덮어쓰지 않는다.
   - 복수 원소는 각 원소가 정체성·행동·환경·변화 중 실제 역할을 가질 때만 쓴다. 역할이 다르면 가능한 범위에서 서로 다른 form 사건으로 보여주고, 단일 원소로 완결되는 입력은 그대로 둔다.
   - "두 번·세 번"은 실제 반복으로, "동시에·한꺼번에"는 병렬로, "뒤·그다음"은 순서로, "변해·합쳐·갈라져"는 전환 과정으로 보존한다.
   - 최종 출력 전에 갈라짐·분열·개화·변신·융합·붕괴·부활·각성 입력이 원자 plan으로 축약되지 않았는지 확인한다. 입력에 없는 효과를 추가하지 않고 같은 효과의 형성·변화·결말이나 서로 다른 원소 역할로 최소 두 사건을 만든다.
   - 최종 출력 전에 연사·속사·연발·잇달아 입력이 원자 plan으로 축약되지 않았는지, form이 최소 2개인지, form 사이 wait이 단독 sequence인지 확인한다. 반대로 일제·동시·유지·단 한 발 입력에는 잘못된 wait이 없는지 확인한다.
   - 완전히 같은 form은 한 단계에서 중복 제거된다. 동일한 동시 투사체의 개수·밀도는 size·form으로 압축하고, 원소·효과·형태가 실제로 다른 사건만 병렬 behaviors로 나눈다.
   - 일식·무지개·팔원소처럼 복수 원소나 대비 자체가 정체성이면 대표 원소 하나로 축약하지 않는다.
   - 서로 다른 원소가 5개를 넘으면 element_primary+element_secondary로 둘씩 짝지어 form 수를 최대 4~5개로 압축한다. 모든 원소는 한 번 이상 포함하되 원소마다 form 하나를 만들지 않는다.
   - 정확히 8원소의 합주라면 2원소씩 짝지은 form 정확히 4개를 사용한다. 2개 sequence에 form 2개씩 병렬 배치하고, 입력에 박자가 없으면 wait을 넣지 않는다. 출력 전에 8원소·4 form·지원 enum을 다시 센다.
   - 입력에 근거가 없는 heal|shield|buff|summon을 창작하지 않는다. 장면 연결에 필요하지 않은 move·wait·추가 form도 만들지 않는다. player 이동 중심 영창에는 의미상 유효한 form이 필수지만 effect는 입력과 이동 목적에서 고른다.
   - 이동·박자·전환이 핵심인 입력을 단일 buff로 대체하지 않는다. buff는 실제 자기 강화가 의미일 때만 사용한다. 특히 회피·탈출·보호·구조 목적이 없는 전이·초고속 도착 영창의 필수 form이 damage 또는 공격적 control인지 출력 전에 확정한다.
   - 비행·춤·추격·순례가 핵심인 제목형에서 소환·별도 관찰 대상이 명시되지 않았다면, 시전자 체현 move를 포함할 수 있는지 출력 전에 확인한다. 단순 지형 변화·파도·유성·투사체의 이동에는 player move를 만들지 않는다.

   **move 계약**
   - destination: cast-point|cast-direction|target-direction|away-from-target|random-direction|custom-vector|random-enemy|arena-center.
   - 일반 이동은 distance를 생략하면 로컬 기본값 180이 된다. 멀리·길게·전장 횡단·크게처럼 거리감이 명시되면 distance를 생략하지 말고 280~420으로 지정한다. 복수의 긴 이동이면 각 move에도 240~420 범위의 distance를 지정해 모든 구간이 기본 거리로 축약되지 않게 한다.
   - 짧은 distance는 반동·회피·미세 조정처럼 작은 변위 자체에 의미가 있을 때만 쓴다. 복수 move라는 이유로 총거리를 보존하려고 각 이동을 짧게 줄이지 않는다.
   - 화면 절대 방향은 custom-vector와 angle을 쓴다(위 0, 오른쪽 90, 아래 180, 왼쪽 -90). custom-vector에는 angle과 distance를 함께 넣는다.
   - 같은 sequence에는 move를 하나만 둔다. move 하나마다 전체 power의 10%가 form 예산에서 빠진다.

   **시간·Power·변수 계약**
   - plan.power는 전체 영창 품질을 0~100으로 판정한다. 단계가 많다는 이유로 power를 높이지 않는다.
   - durationMs는 전체 plan 요청 시간이며 80~min(3000, 500+power×25) 범위다. 복합 관계가 없는 원자 plan은 기존 단일 주문의 즉시 발동감을 보존하도록 80ms로 둔다. move 없는 복합 plan은 최소 500ms를 유지한다.
   - player move의 **해당 단계 목표시간**을 의미에서 먼저 고른다: 순간이동·점멸·찰나 80~160ms, 섬광·극고속 돌파 100~220ms, 대시·돌진·급습 180~400ms, 비행·활공·추격 350~650ms, 일반 이동·운송 400~700ms, 명시적으로 느린 보행·부유·순례 700~1200ms.
   - 이동 거리와 이동 속도를 분리한다. 멀리·장거리라는 이유만으로 느리게 만들지 않으며, 느리다·천천히·장엄한 행진처럼 속도 의미가 명시되지 않은 move 단계는 원칙적으로 700ms를 넘기지 않는다.
   - 복수 이동은 각 구간의 의미에 맞는 목표시간을 별도로 고른다. 장거리 순간이동도 짧을 수 있고, 비행·활공·추격은 전투형 이동으로 빠르게 보여준다. 이동 수가 많다는 이유만으로 모든 구간을 같은 짧은 시간으로 축약하지 않는다.
   - move+form 한 단계 병렬이면 form 연출 때문에 이동까지 늘어지지 않도록 이동 목표시간을 그 단계의 기준으로 삼는다. 긴 장판·잔상·폭발이 필요하면 이동과 분리된 form 단계에 둔다. move 앞뒤에 별도 공격 사건이 있으면 각 사건 시간을 더해 전체 durationMs를 정하고 durationWeight를 목표시간 비율에 가깝게 배분한다.
   - durationWeight는 상대 시간 비율이다. 모든 이동을 관습적으로 2로 두지 않는다. 예를 들어 300ms 이동 뒤 600ms 폭발이면 전체 약 900ms, weight 1:2가 자연스럽다. 의도적인 긴 대기만 2~3을 쓴다.
   - 단일 move+form 단계의 전투형 비행·활공·추격은 전체 durationMs도 350~650ms로 둔다. 예: 빠른 빙조 비행 520ms, 폭풍 활공 480ms, 그림자 추격 420ms. 반대로 "느린 별빛 순례"처럼 느림이 핵심이면 900~1100ms가 자연스럽다.
   - 모든 form은 남은 전체 power를 powerWeight 비율로 나눈다: 보조 1, 주요 2, 피날레 2~3. 동등한 병렬 공격은 같은 값을 쓴다.
   - tuning은 절대 수치가 아니라 behavior 내부 상대 강조다. 사용할 때만 damage|range|radius|duration|strength|amount 중 의미 있는 축을 최소 2개 골라 1~3의 상대값으로 낸다. 한 키만 있는 tuning은 넣지 않는다.
   - 각 form의 spec.power와 spec.cost는 항상 0이다. 로컬이 재계산한다.
   - 스키마에 없는 enum, 절대 피해·적 좌표·무적을 만들지 않는다. 출력 전에 최소 1개 유효 sequence, enum, 필수 필드, wait 단독 배치를 자체 점검한다.
   - 최종 출력 전에 이동 주체를 다시 본다. player 이동이면 원자 plan이 아닌지, spell_plan에 move와 실행 가능한 form이 모두 있는지 검사하고 하나라도 없으면 고친다. 같은 사건이면 move와 form의 주원소도 맞춘다. X의 이동처럼 X가 별도 현상·형상·소환수이면 player move를 제거하고 form 궤적으로 표현한다. player가 한 바퀴·원을 그리며·주위를 도는 입력이면 move가 최소 2개인지 세고, 하나뿐이면 서로 다른 방향의 두 구간으로 고친다.
   - 최종 출력의 effect가 위 전투 목적 판정과 충돌하면 JSON을 내기 전에 다시 구성한다. 특히 회피·보호 목적 없는 전이·점멸·초고속 도착에 buff|shield를 출력하지 않는다.
   - form은 bolt|beam|slash|wave|nova|rain|wall|cage|orbit|summon|buff|zone|chain만 허용한다. dash·storm·teleport 같은 동작명이나 새 이름을 form에 넣지 않았는지 최종 확인한다.

   원리 대조 예시:
   - "빛의 창" → 사건 하나이므로 form 1개인 원자 plan.
   - "순간 전이" → 회피·보호 목적이 없으므로 빠른 player move와 도착 nova 또는 이동 궤적 wave의 damage|control form. buff|shield가 아니다.
   - "위험을 피해 점멸한다" → 회피 목적이 명시됐으므로 빠른 player move와 shield|buff form. 공격을 억지로 추가하지 않는다.
   - "잠든 산맥이 깨어난다" → 지형의 기상·융기 form이며 player move가 아니다.
   - "서리 날개의 비행" → 제목형 이동 과정을 player가 체현하는 move+ice form의 spell_plan.
   - "서리 새를 소환해 날려 보낸다" → 별도 소환수의 비행이며 player move가 아니다.
   - "서리 날개의 깃털" → 정적 이미지의 단일 ice form이며 player move가 아니다.
   - "빛의 창이 불·얼음·번개 세 갈래로 갈라져 동시에 꽂힌다" → 분열/동시성이 핵심인 spell_plan. 같은 단계에 원소가 다른 병렬 form 3개.
   - "점멸하며 벤다" → 같은 순간의 플레이어 이동+참격이므로 한 단계에 move+form.
   - "물러선 뒤 폭발시킨다" → 이동 완료 후 공격이므로 move 다음 form.
   - "파고들어 베고 빠져나온다" → 접근 move, 참격 form, 이탈 move. 각 이동은 화면에서 인식 가능한 거리로 둔다.
   - "전장을 가로질러 되돌아오며 휩쓴다" → 긴 전진 move+경로 form 뒤 긴 귀환 move+경로 form. 복수 move라는 이유로 짧게 줄이지 않는다.
   - "종이 한 번 울리고 잠시 뒤 다시 울린다" → form, wait-only, form.
   - "황혼의 무도" → 빛과 어둠의 교대·춤이 핵심이므로 관계를 가진 spell_plan. 단일 dark nova로 축약하지 않는다.
   - "영원의 방벽" → 지속적인 방어 이미지 하나로 충분하므로 단일 shield/wall. 장식용 전개 단계를 만들지 않는다.
   - "점멸하며 벤다" → 80~200ms light move와 같은 순간의 light damage slash.
   - "안전한 그림자로 몸을 피한다" → 짧은 dark move와 회피 목적의 shield 또는 buff form. damage를 강제하지 않는다.
   - "구름에 올라 몸놀림이 빨라진다" → wind move와 지속적인 buff form.
   - "찌른 곳에는 잔상만 남는다" → 찌르기 form 다음 빠른 move. 잔상만 보고 self buff로 축약하지 않는다.
   - "순보로 타격을 피한다" → 짧은 move와 회피 효용의 shield 또는 buff form. move-only로 끝내지 않는다.

   완전 JSON 최소 대조 예시:
   입력: "푸른 유성이 적에게 날아간다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"푸른 유성","power":72,"durationMs":80,"sequences":[{"durationWeight":1,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"푸른 유성","effect":"damage","target":"enemy","element_primary":"water","element_secondary":"light","form":"bolt","size":"large","speed":"fast","status":[],"power":0,"cost":0}}]}]}}
   이유: 마법 형상의 이동은 플레이어 move가 아니며 bolt 하나로 완결된다.

   입력: "내가 번개가 되어 파고들며 벤다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"뇌광 돌입참","power":78,"durationMs":280,"sequences":[{"durationWeight":1,"behaviors":[{"type":"move","destination":"target-direction","element":"lightning"},{"type":"form","powerWeight":2,"tuning":{"damage":2,"range":1},"spec":{"name":"돌입 참격","effect":"damage","target":"enemy","element_primary":"lightning","element_secondary":null,"form":"slash","size":"large","speed":"fast","status":["shock"],"power":0,"cost":0}}]}]}}
   이유: 플레이어 이동과 참격이 동시에 일어나므로 같은 단계의 move+form이다.

   입력: "대지의 종이 두 번 울린다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"대지의 이중 종","power":74,"durationMs":1900,"sequences":[{"durationWeight":1,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"첫 울림","effect":"control","target":"area","element_primary":"earth","element_secondary":null,"form":"nova","size":"large","speed":"normal","status":["slow"],"power":0,"cost":0}}]},{"durationWeight":1,"behaviors":[{"type":"wait"}]},{"durationWeight":1,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"둘째 울림","effect":"control","target":"area","element_primary":"earth","element_secondary":null,"form":"nova","size":"large","speed":"normal","status":["slow"],"power":0,"cost":0}}]}]}}
   이유: 명시된 두 박동과 사이 간격을 form, wait-only, form으로 보존한다.

   입력: "뇌광탄을 세 번 연사한다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"뇌광 삼연사","power":72,"durationMs":1350,"sequences":[{"durationWeight":2,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"첫 뇌광탄","effect":"damage","target":"enemy","element_primary":"lightning","element_secondary":null,"form":"bolt","size":"medium","speed":"fast","status":["shock"],"power":0,"cost":0}}]},{"durationWeight":1,"behaviors":[{"type":"wait"}]},{"durationWeight":2,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"둘째 뇌광탄","effect":"damage","target":"enemy","element_primary":"lightning","element_secondary":null,"form":"bolt","size":"medium","speed":"fast","status":["shock"],"power":0,"cost":0}}]},{"durationWeight":1,"behaviors":[{"type":"wait"}]},{"durationWeight":2,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"셋째 뇌광탄","effect":"damage","target":"enemy","element_primary":"lightning","element_secondary":null,"form":"bolt","size":"medium","speed":"fast","status":["shock"],"power":0,"cost":0}}]}]}}
   이유: 연사는 동시 밀집 공격이 아니라 개별 발사 사이의 짧은 시간차가 핵심이며, 세 번은 form 3개와 wait 2개로 보존한다.

   입력: "적들을 잇는 번개 사슬"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"번개 사슬","power":70,"durationMs":80,"sequences":[{"durationWeight":1,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"번개 사슬","effect":"damage","target":"enemy","element_primary":"lightning","element_secondary":null,"form":"chain","size":"large","speed":"fast","status":["shock"],"power":0,"cost":0}}]}]}}
   이유: chain form 자체가 여러 적을 잇는 관계를 표현하므로 과분할하지 않는다.

   입력: "바람을 딛고 왼쪽과 오른쪽으로 연달아 도약한다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"바람 디딤","power":64,"durationMs":800,"sequences":[{"durationWeight":1,"behaviors":[{"type":"move","destination":"custom-vector","element":"wind","angle":-90,"distance":150},{"type":"form","powerWeight":1,"spec":{"name":"왼발 바람격","effect":"damage","target":"area","element_primary":"wind","element_secondary":null,"form":"nova","size":"small","speed":"fast","status":[],"power":0,"cost":0}}]},{"durationWeight":1,"behaviors":[{"type":"move","destination":"custom-vector","element":"wind","angle":90,"distance":150},{"type":"form","powerWeight":1,"spec":{"name":"오른발 바람격","effect":"damage","target":"area","element_primary":"wind","element_secondary":null,"form":"nova","size":"small","speed":"fast","status":[],"power":0,"cost":0}}]}]}}
   이유: 플레이어의 연속 도약과 각 발걸음의 바람 충격이 같은 단계에서 일어난다. 이동만 남기거나 unrelated 투사체를 붙이지 않는다.

   입력: "연막 속으로 몸을 피한다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"연막 회피","power":62,"durationMs":300,"sequences":[{"durationWeight":1,"behaviors":[{"type":"move","destination":"away-from-target","element":"dark"},{"type":"form","powerWeight":1,"spec":{"name":"연막 보호","effect":"shield","target":"self","element_primary":"dark","element_secondary":null,"form":"buff","size":"small","speed":"fast","status":[],"power":0,"cost":0}}]}]}}
   이유: 회피 이동의 목적은 공격이 아니라 안전 확보이므로 move와 짧은 shield form을 결합한다.

   입력: "빛과 어둠이 동시에 교차해 폭발한다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"명암 교차폭발","power":84,"durationMs":1900,"sequences":[{"durationWeight":2,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"교차하는 빛","effect":"damage","target":"area","element_primary":"light","element_secondary":null,"form":"beam","size":"large","speed":"fast","status":[],"power":0,"cost":0}},{"type":"form","powerWeight":1,"spec":{"name":"터지는 어둠","effect":"damage","target":"area","element_primary":"dark","element_secondary":null,"form":"nova","size":"large","speed":"fast","status":["weaken"],"power":0,"cost":0}}]}]}}
   이유: 서로 다른 원소를 지원 enum의 병렬 forms로 구성하며 새 form 이름을 만들지 않는다.

   입력: "달아나는 혜성이 빛의 꼬리를 남긴다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"도주하는 혜성","power":68,"durationMs":80,"sequences":[{"durationWeight":1,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"도주하는 혜성","effect":"damage","target":"enemy","element_primary":"light","element_secondary":"fire","form":"orbit","size":"medium","speed":"fast","status":[],"power":0,"cost":0}}]}]}}
   이유: 움직이는 주체는 혜성 형상이다. player move나 self buff를 만들지 않고 빠른 orbit의 궤적으로 표현한다.

   입력: "불길을 거슬러 돌진한다"
   출력: {"schema_version":2,"disposition":"cast","spell_plan":{"name":"화염 역행 돌파","power":76,"durationMs":480,"sequences":[{"durationWeight":1,"behaviors":[{"type":"move","destination":"target-direction","element":"fire"},{"type":"form","powerWeight":2,"spec":{"name":"맞서는 불길","effect":"damage","target":"area","element_primary":"fire","element_secondary":null,"form":"wave","size":"large","speed":"fast","status":["burn"],"power":0,"cost":0}}]}]}}
   이유: 시전자가 환경을 거슬러 이동하므로 move와 환경 form을 같은 단계에 병렬로 둔다. 반면 "불길의 역류"라면 불길 자체의 wave이며 player move가 아니다.

cast 출력 스키마:
{
  "schema_version": 2,
  "disposition": "cast",
  "spell_plan": {
    "name": "전체 영창명 (12자 이내)", "power": 70, "durationMs": 900,
    "sequences": [
      { "durationWeight": 2, "behaviors": [ { "type": "move", "destination": "target-direction", "element": "fire" } ] },
      { "durationWeight": 1, "behaviors": [ { "type": "form", "powerWeight": 2, "tuning": { "damage": 2, "radius": 1 }, "spec": { "name": "돌진 폭발", "effect": "damage", "target": "self", "element_primary": "fire", "element_secondary": null, "form": "nova", "size": "large", "speed": "normal", "status": ["burn"], "power": 0, "cost": 0 } } ] }
    ]
  }
}
behavior는 effect가 summon이고 움직임 묘사가 있을 때만 포함한다(그 외 생략). steps는 위 6개 kind만, 최대 6개.
shape는 form이 wall이고 모양 묘사가 있을 때만 포함한다(그 외 생략). kind는 위 6개(arc·line·zigzag·wave·ring·polygon)만.
모든 cast는 대표 spell을 생략하고 spell_plan만 낸다. 닫힌 단일 사건은 sequences 1개와 form 1개인 원자 plan이며, 확장 가능한 사건은 입력 의미에 근거한 복합 plan이다. type은 form|move|wait, move는 플레이어 이동에만 사용하고 element가 필수다. destination은 위 8종만 사용한다. custom-vector는 angle·distance를 함께 낸다. plan.power는 전체 품질 판정값이며 spec.power/cost는 0으로 둔다.

fizzle 출력: {"schema_version":2,"disposition":"fizzle","reason":"nonsense","message":"마력이 형태를 이루지 못했다"}
blocked 출력: {"schema_version":2,"disposition":"blocked","reason":"unsafe","message":"해당 문장으로는 영창할 수 없습니다"}

플레이어의 주문:`;

const BOSS_LINE_PROMPT = `당신은 로그라이크 게임 INCANT의 기억하는 최종 보스다. 플레이어의 지난 전적 요약(JSON)을 보고, 그를 도발하는 짧고 위협적인 대사를 한국어로 말한다.
규칙:
- 1~2문장, 40자 이내.
- 있을 때만 애용 원소(favoriteElement)·최고 주문명(topSpellName)·사망 횟수(deaths)를 자연스럽게 비꼰다.
- 첫 조우(deaths·clears 모두 0)면 낯선 도전자를 얕보는 톤.
- 순수 대사 한 줄만 출력한다. 따옴표·설명·JSON 없이.

플레이어 전적:`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': [
      'Server-Timing',
      'X-Incant-Judge-Attempts',
      'X-Incant-Prompt-Tokens',
      'X-Incant-Output-Tokens',
      'X-Incant-Cached-Tokens',
      'X-Incant-Judge-Retry',
      'X-Incant-Diagnostic-Version',
    ].join(', '),
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}

/**
 * 보스 대사 생성 — 런 요약(JSON) → 1~2문장 위협 대사.
 * 클라이언트는 실패 시 템플릿 폴백하므로, 여기선 순수 대사만 { text } 로 반환한다.
 */
async function bossLine(request, env, cors) {
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'no_api_key_bound' }), { status: 500, headers: cors });
  }
  let summary;
  try {
    summary = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
  }

  const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${BOSS_LINE_PROMPT}\n${JSON.stringify(summary).slice(0, 300)}` }] }],
      generationConfig: {
        maxOutputTokens: 200,
      },
    }),
  });
  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 300) }),
      { status: 502, headers: cors },
    );
  }
  const data = await geminiRes.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  // 공백 정리 + 앞뒤 따옴표 제거 + 길이 제한
  const line = String(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .slice(0, 80);
  if (!line) {
    return new Response(JSON.stringify({ error: 'empty line' }), { status: 502, headers: cors });
  }
  return new Response(JSON.stringify({ text: line }), { status: 200, headers: cors });
}

const EVOLVE_NAME_PROMPT = `당신은 로그라이크 게임 INCANT의 작명가다. 주문 진화 또는 정령 융합 정보(JSON)를 보고, 격상된 주문/정령의 멋진 새 이름을 한국어로 하나만 짓는다.
규칙:
- kind가 "evolve"면 baseName을 발전시킨 상위 이름, "fuse"면 두 원소를 녹인 새 이름.
- 12자 이내, 함축적이고 강렬하게. (예: fire+lightning 융합 → "작열하는 뇌운")
- 순수 이름 한 줄만 출력한다. 따옴표·설명·JSON 없이.

정보:`;

/**
 * 진화·융합 작명 — 요청(JSON) → 격상 주문명 하나.
 * 클라이언트는 실패 시 템플릿 폴백하므로, 여기선 순수 이름만 { name } 으로 반환한다.
 */
async function evolveName(request, env, cors) {
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'no_api_key_bound' }), { status: 500, headers: cors });
  }
  let req;
  try {
    req = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
  }

  const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${EVOLVE_NAME_PROMPT}\n${JSON.stringify(req).slice(0, 200)}` }] }],
      generationConfig: {
        maxOutputTokens: 100,
      },
    }),
  });
  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 300) }),
      { status: 502, headers: cors },
    );
  }
  const data = await geminiRes.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const name = String(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'『「]+|["'』」]+$/g, '')
    .slice(0, 12);
  if (!name) {
    return new Response(JSON.stringify({ error: 'empty name' }), { status: 502, headers: cors });
  }
  return new Response(JSON.stringify({ name }), { status: 200, headers: cors });
}

export default {
  async fetch(request, env) {
    // 허용 오리진: 배포(ALLOWED_ORIGIN) + 로컬 개발(vite dev).
    // 요청 Origin이 허용 목록에 있으면 그대로 반사, 아니면 배포 오리진으로 응답.
    const allowed = [env.ALLOWED_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    const reqOrigin = request.headers.get('Origin');
    // 로컬 개발은 포트가 유동적(5173이 점유되면 5174…)이므로 localhost/127.0.0.1의 임의 포트를 허용한다.
    // (허용 안 하면 CORS 차단 → 판정이 조용히 MockJudge로 폴백돼 "가짜 판정"을 테스트하게 됨)
    const isLocalDev = !!reqOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(reqOrigin);
    const origin = allowed.includes(reqOrigin) || isLocalDev ? reqOrigin : (env.ALLOWED_ORIGIN ?? '*');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'rate limited', limit: RATE_LIMIT_PER_MIN }), {
        status: 429,
        headers: { ...cors, 'Retry-After': '60' },
      });
    }

    // 경로 라우팅: /boss-line 보스 대사, /evolve-name 진화·융합 작명, 그 외(/) 주문 판정
    const path = new URL(request.url).pathname;
    if (path.endsWith('/boss-line')) {
      return bossLine(request, env, cors);
    }
    if (path.endsWith('/evolve-name')) {
      return evolveName(request, env, cors);
    }
    let text;
    try {
      const body = await request.json();
      text = String(body.text ?? '').slice(0, 60);
    } catch {
      return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
    }
    if (!text.trim()) {
      return new Response(JSON.stringify({ error: 'empty text' }), { status: 400, headers: cors });
    }

    // [진단용] 시크릿 바인딩 확인 — 값은 노출하지 않고 존재·길이만
    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'no_api_key_bound', keyLen: (env.GEMINI_API_KEY || '').length }),
        { status: 500, headers: cors },
      );
    }

    let geminiAttempts = 0;
    let geminiElapsedMs = 0;
    let promptTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let retryReason = 'none';
    const requestGemini = async (prompt) => {
      geminiAttempts += 1;
      const startedAt = performance.now();
      try {
        return await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 2048,
              responseMimeType: 'application/json',
            },
          }),
        });
      } finally {
        geminiElapsedMs += performance.now() - startedAt;
      }
    };
    const recordUsage = (responseData) => {
      const usage = responseData?.usageMetadata;
      promptTokens += Number(usage?.promptTokenCount ?? 0);
      outputTokens += Number(usage?.candidatesTokenCount ?? 0);
      cachedTokens += Number(usage?.cachedContentTokenCount ?? 0);
    };
    const diagnosticHeaders = () => ({
      ...cors,
      'Server-Timing': `gemini;dur=${geminiElapsedMs.toFixed(1)}`,
      'X-Incant-Judge-Attempts': String(geminiAttempts),
      'X-Incant-Prompt-Tokens': String(promptTokens),
      'X-Incant-Output-Tokens': String(outputTokens),
      'X-Incant-Cached-Tokens': String(cachedTokens),
      'X-Incant-Judge-Retry': retryReason,
      'X-Incant-Diagnostic-Version': '8',
    });

    let geminiRes = await requestGemini(`${JUDGE_PROMPT}\n"${text}"`);

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => '');
      return new Response(
        JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 500) }),
        { status: 502, headers: cors },
      );
    }

    let data = await geminiRes.json();
    recordUsage(data);
    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    // 모델이 코드펜스(```json)나 "Here is the JSON..." 같은 서두를 덧붙일 수 있으므로
    // 첫 '{' ~ 마지막 '}' 구간만 추출해 파싱한다. (검증은 클라이언트 validateSpec에서 한 번 더)
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    let json = first !== -1 && last > first ? raw.slice(first, last + 1) : raw;
    let parsed;
    try {
      parsed = parseJudgeJson(json);
    } catch {
      retryReason = 'json-syntax';
      geminiRes = await requestGemini(
        `${JUDGE_PROMPT}\n"${text}"\n`
        + '직전 출력은 JSON 괄호·쉼표·키 문법이 깨져 파싱할 수 없었다. '
        + '의미 판정을 유지하되 코드펜스나 설명 없이 계약에 맞는 완전한 JSON 객체를 '
        + '처음부터 다시 출력하라.',
      );
      if (!geminiRes.ok) {
        const detail = await geminiRes.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 500) }),
          { status: 502, headers: cors },
        );
      }
      data = await geminiRes.json();
      recordUsage(data);
      raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const repairFirst = raw.indexOf('{');
      const repairLast = raw.lastIndexOf('}');
      json = repairFirst !== -1 && repairLast > repairFirst
        ? raw.slice(repairFirst, repairLast + 1)
        : raw;
      try {
        parsed = parseJudgeJson(json);
      } catch {
        return new Response(
          JSON.stringify({ error: 'invalid llm output', raw: String(raw).slice(0, 500) }),
          { status: 502, headers: cors },
        );
      }
    }

    const retryableFizzle = parsed?.disposition === 'fizzle' && !isObviousNonsense(text);
    const movementWithoutForm = hasMoveWithoutFormSpellPlan(parsed);
    const wrongPossessiveMove = isPossessiveNonPlayerMotion(text) && hasMoveSpellPlan(parsed);
    const unsupportedForm = hasUnsupportedForm(parsed);
    const footstepWithoutDamage = /답보/u.test(text) && !hasDamageFormSpellPlan(parsed);
    const atomicChange = isUnexpectedAtomicChangeCast(parsed, text);
    if (
      isWaitOnlySpellPlan(parsed)
      || retryableFizzle
      || movementWithoutForm
      || wrongPossessiveMove
      || unsupportedForm
      || footstepWithoutDamage
      || atomicChange
    ) {
      retryReason = retryableFizzle
        ? 'fizzle'
        : wrongPossessiveMove
          ? 'possessive-move'
          : unsupportedForm
            ? 'unsupported-form'
            : footstepWithoutDamage
              ? 'footstep-without-damage'
              : atomicChange
                ? 'atomic-change'
                : movementWithoutForm
                  ? 'move-without-form'
                  : 'wait-only';
      const correction = retryableFizzle
        ? '직전 출력은 문법적으로 의미 있는 입력을 fizzle로 잘못 분류했다. '
          + '입력의 비유·수량·시간 관계를 해석해 cast로 판정하라. '
        : wrongPossessiveMove
          ? '직전 출력은 "X의 이동"에서 별도 현상·형상·소환수 X의 움직임을 player move로 잘못 바꿨다. '
            + 'player move를 제거하고 X의 움직임을 form의 형상·속도·궤적으로 표현하라. '
        : unsupportedForm
          ? '직전 출력은 지원하지 않는 form enum을 사용했다. '
            + 'form을 bolt|beam|slash|wave|nova|rain|wall|cage|orbit|summon|buff|zone|chain 중 '
            + '입력 의미에 가장 가까운 값으로 다시 선택하라. '
        : footstepWithoutDamage
          ? '직전 출력은 답보의 발걸음 이미지를 단순 buff로 축약했다. '
            + '명시적인 보호·강화 목적이 없으므로 발을 디딜 때 생기는 충격·참격·파동을 '
            + 'move와 같은 주원소의 damage form으로 표현하라. '
        : atomicChange
          ? '직전 출력은 갈라짐·분열·개화·변신·융합·붕괴·부활·각성의 변화 과정을 원자 사건으로 축약했다. '
            + '입력에 없는 효과를 창작하지 말고 변화의 시작과 결과를 최소 두 form 또는 두 실행 사건으로 표현하라. '
        : movementWithoutForm
          ? '직전 spell_plan에는 player move가 있지만 실행 가능한 form이 없어 현재 게임플레이 계약을 위반했다. '
            + '입력의 명시 효과, 이동의 직접 결과, 이동 목적 순으로 자연스러운 effect를 고르고 '
            + 'damage|control|shield|buff|heal|summon 중 의미에 맞는 form을 plan에 포함하라. '
        : '직전 출력은 spell_plan의 모든 behavior가 wait이라 실행 효과가 전혀 없었다. '
          + 'wait은 사건 사이 간격으로만 사용하고, 입력 의미에 맞는 form 또는 move 사건을 포함하라. ';
      geminiRes = await requestGemini(
        `${JUDGE_PROMPT}\n"${text}"\n`
        + correction
        + '계약에 맞는 완전한 JSON을 처음부터 다시 출력하라.',
      );
      if (!geminiRes.ok) {
        const detail = await geminiRes.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 500) }),
          { status: 502, headers: cors },
        );
      }
      data = await geminiRes.json();
      recordUsage(data);
      raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const retryFirst = raw.indexOf('{');
      const retryLast = raw.lastIndexOf('}');
      json = retryFirst !== -1 && retryLast > retryFirst
        ? raw.slice(retryFirst, retryLast + 1)
        : raw;
      try {
        parsed = parseJudgeJson(json);
      } catch {
        return new Response(
          JSON.stringify({ error: 'invalid llm output', raw: String(raw).slice(0, 500) }),
          { status: 502, headers: cors },
        );
      }
    }
    if (isCompletedAttackExit(text) && hasDamageFormSpellPlan(parsed)) {
      removeNonDamageFormBehaviors(parsed);
    }
    if (isNonAttackingMount(text)) {
      removeDamageFormBehaviors(parsed);
    }
    fillExplicitLongMoveDistances(parsed, text);
    ensureExplicitCircularMoveChoreography(parsed, text);
    ensureRepeatedFootstepChoreography(parsed, text);
    expandRapidFireSingleSpell(parsed, text);
    promoteCastSpellToAtomicPlan(parsed);
    const normalized = normalizeJudgeOutput(parsed);
    return new Response(JSON.stringify(normalized.value), {
      status: 200,
      headers: diagnosticHeaders(),
    });
  },
};
