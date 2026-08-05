/**
 * INCANT 주문 판정 프록시 — Cloudflare Worker
 * 역할: ① Gemini API 키 은닉 ② 레이트리밋 ③ CORS ④ 프롬프트 서버측 고정
 *
 * 배포: proxy/README.md 참조 (wrangler + GEMINI_API_KEY 시크릿)
 * 클라이언트는 { text } 만 보내고, 판정 프롬프트·스키마는 여기서 강제한다.
 * (프롬프트를 클라이언트에 두면 조작 가능 — 서버측 고정이 원칙)
 */
import {
  capSpellPlanPower,
  expandRapidFireSingleSpell,
  hasDamageFormSpellPlan,
  hasMoveSpellPlan,
  hasTooManySpellPlanElements,
  hasUnsupportedForm,
  isWaitOnlySpellPlan,
  isUnexpectedAtomicChangeCast,
  limitSpellPlanElements,
  normalizeJudgeOutput,
  promoteCastSpellToAtomicPlan,
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

function parseJudgeJson(json) {
  return JSON.parse(json);
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
   - effect를 고르기 전에 입력 전체의 **전투 목적**을 판정하고, 서로 독립된 목적이 하나인지 여러 개인지 구분한다. 명시 단어 하나만 찾지 말고 주체·행동·결과·정서·비유가 함께 만드는 역할을 본다.
   - 치유·보호·강화·구조·소환 목적이 명시되거나 전체 이미지에서 강하게 함축되면 heal|shield|buff|summon을 우선 보존한다. 직접적인 효과 단어가 없다는 이유로 추상적인 지원 주문을 damage로 바꾸지 않는다.
   - 적대적 주체 또는 절단·관통·충돌·파괴·폭발·추락·포식·사냥·응징처럼 직접적인 위해가 명시되거나 강하게 함축되면 damage를 선택한다. 공격 이미지를 control이나 buff로 안전하게 약화하지 않는다.
   - 속박·정지·둔화·밀쳐냄·가둠·약화처럼 적의 행동을 제한하는 목적이 명시되거나 강하게 함축될 때만 control을 선택한다. 장송·어둠·한기·폭풍·공포 같은 분위기, 넓은 범위, 화려한 연출만으로 damage를 control로 바꾸지 않는다.
   - 공격·지원 어느 쪽도 강하지 않거나 양쪽 해석의 근거가 비슷한 영창은 전투 주문의 기본값으로 damage를 선택한다. 이 기본값은 강하게 함축된 heal|shield|buff|control|summon을 덮어쓰지 않는다.
   - 목적이 생략된 추상적 player 이동은 궤적·접촉·도착에서 파생한 damage를 우선한다. 회피·탈출·은폐·안전 확보·구조·치유 또는 적 제어 목적이 강하게 읽힐 때만 해당 shield|buff|heal|control을 유지하며 근거 없는 damage를 추가하지 않는다.
   - 서로 다른 effect는 입력에 서로 독립된 전투 목적이 각각 명시되거나 강하게 함축될 때만 함께 쓴다. 순수 공격 입력은 모든 공격 사건을 damage로 유지하고, 시각적 다양성을 위해 control|heal|shield|buff|summon을 창작하지 않는다.
   - 여러 원소의 이름·수량·집합만 제시된 입력에는 지원·제어 목적이 없다. 일반 영창 한도에서 선택한 최대 2원소의 모든 form을 damage로 유지하며, 원소마다 서로 다른 effect를 배정하지 않는다.
   - element는 명시 원소를 최우선으로 보존한다. 명시가 없으면 존재·현상의 **정체성**을 주원소로, 행동·운동·환경을 설명하는 원소를 보조 원소로 해석할 수 있다.
   - 일반 영창의 plan 전체에서 사용하는 고유 원소는 최대 2개다. 단일 원소로 의미가 완결되면 하나만 유지하고, 두 원소가 각기 다른 의미 역할을 가질 때만 둘을 별도 form·sequence 또는 병렬 form으로 교대·융합·변화·충돌·수렴시킨다.
   - 입력에 3개 이상의 원소나 "팔원소" 같은 집합이 있어도 일반 영창 한도는 해제되지 않는다. 존재·현상의 정체성을 담당하는 주원소와 별도 사건·관계를 담당하는 보조 원소를 우선해 가장 의미 중심적인 2개만 선택한다. 나머지 원소를 보존하려고 form을 추가하지 않는다.
   - 이 제한은 form·sequence 복잡도 제한이 아니다. 한두 원소만으로도 입력에 사건·관계·변화가 충분하면 여러 form과 풍부한 안무를 구성한다. 3개 이상을 모두 실현하는 필살 영창은 현재 일반 Judge 계약 밖이다.
   - 예: 화염 존재가 날개짓·상승기류로 비행하면 fire는 정체성, wind는 행동 역할이다. 날개·비행·활공이 별도 사건 또는 핵심 행동이고 다른 이동 매질이 명시되지 않았다면 wind를 보조 원소나 별도 form으로 보존한다. 반대로 순수 번개 사슬처럼 단일 원소로 의미가 완결되면 다양성을 위해 보조 원소를 창작하지 않는다.
   - "배고프다", "피곤하다"처럼 상태를 말하는 문장은 heal 또는 buff/self로 해석한다.
   - "나를 지켜줘"는 shield/self, "숲의 분노"는 damage 또는 control/area로 해석한다.
   - "라이트닝 스톰"과 "lightning storm"은 번개 폭풍의 동일한 의미로 해석하되, storm은 의미 단어일 뿐 form enum이 아니다. 효과에 따라 지원 form rain|zone|nova 중 하나로 번역하고 form:"storm"은 절대 출력하지 않는다.
   - 근접에서 **베거나 휘두르는 동작**(칼·도끼·발톱·횡베기·참격 등)은 form=slash로 고른다. 멀리 던지거나 쏘는 투사체(bolt)·광선(beam)과는 구분한다.
   - **직선 공격은 bolt와 beam으로 갈린다.** 하나의 대상에 날아가 맞고 끝나는 **단발 탄체**(구슬·화살·탄환·던진 창)는 bolt다. **경로 위의 것을 관통해 지나가는 것**(꿰뚫는다·관통·일직선으로 뚫고·레이저·광선·빛줄기)은 beam이다. 게임에서 beam은 실제로 직선상의 적을 모두 타격하므로, 관통 묘사에 bolt를 고르면 플레이어가 말한 것이 사라진다.
4. power와 cost를 정한다.
   - 일반 영창의 power는 30~80이다. 창의성은 주로 form·병렬·sequence·변화·피날레로 보상하고 power에는 작고 제한적으로만 반영한다.
   - 기본 전투 주문은 의미와 직접성에 따라 power 45~60에서 시작한다. 단순하지만 명확한 주문도 불필요하게 약화하지 않는다.
   - 목적·대상·결과가 구체적으로 연결되면 최대 +8, 서로 구별되는 사건·관계·변화가 창의적으로 연결되면 최대 +10 범위에서 가점한다. 최종 power는 80을 넘기지 않는다.
   - 마법과 무관하지만 의미 있는 문장을 약한 효용 주문으로 번역할 때는 power 30~45로 둔다.
   - 문장 길이, 수식어 수, 원소 수, behavior·sequence 수, 단순 키워드 나열은 power 가점 근거가 아니다. 복합 plan도 form 수와 무관하게 하나의 전체 power 예산만 가진다.
   - 표기 언어(한국어·외래어·영어)는 power에 영향을 주지 않는다. 번역했을 때 의미와 구체성이 같으면 power도 동일해야 한다.
   - 짧아도 사건과 관계가 선명하면 창의적일 수 있으며, 같은 의미를 장황하게 풀어쓴 문장보다 낮게 평가하지 않는다.
   - 기준 예시: "파이어볼"은 45~50, 관계 없는 두 원소 "불과 얼음"은 50~60, 관계가 추가된 "불과 얼음의 이중주"는 65~75, 변화와 서사가 연결된 단일 원소 영창도 65~75가 적절하다. 이는 이름별 고정값이 아니라 의미 구조 차이의 기준점이다.
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
7. 모든 cast는 **spell_plan만** 출력한다. 먼저 입력에서 명시되거나 강하게 함축된 사건과 그 관계(순서·동시·반복·지연·변화·인과)를 파악한다.
   - 사건 하나가 form 하나로 완결되면 sequences 1개·form 1개인 **원자 plan**으로 구성한다. 대표 spell은 생략한다.
   - 서로 다른 사건, 순서·동시성·반복·지연·변화가 자연스럽게 읽히면 그 관계를 화면에 남기는 **복합 plan**을 구성한다. 단계 수 자체가 목적은 아니며, 모든 form은 입력의 이미지·동사·관계 중 하나를 설명해야 한다.
   - 갈라짐·분열·개화·변신·융합·붕괴·부활·각성은 시작과 결과가 구분되는 강한 변화 신호다. 하나의 form으로 축약하지 말고 최소 두 form 사건으로 표현한다.
   - 비행·활공·질주·추격·춤·왈츠·순례·선회·도약·돌진 같은 과정어는 제목형이어도 사건 신호다. form의 speed·form·순차·병렬로 그 과정이 충분히 보이지 않을 때만 최소 2~4개 form 사건을 구성한다.
   - 위치 변화가 핵심인 입력도 player 이동을 출력하지 않는다. 궤적·접촉·충돌·잔상·도착 결과는 form의 speed·형태·순서로 표현한다. 방향 좌표·목적지·이동 거리는 이 계약에서 표현하지 않는다.
   - 움직임을 단일 buff로 축약하지 않는다. 회피·탈출·은폐·안전 확보가 명시되면 shield|buff를 쓸 수 있지만, 그렇지 않으면 입력의 충돌·관통·휩쓸기·발걸음 흔적에 맞는 damage form을 고른다. 속박·둔화·밀쳐냄·가둠·약화가 강하게 읽힐 때만 control을 쓴다.

   **effect 경계**
   - 입력의 전투 목적이 하나면 복합 plan의 모든 form도 그 effect 경계를 유지한다. 순수 공격 주문의 병렬성과 화려함은 damage form들의 형태·원소·범위·속도·크기·타이밍으로 만든다.
   - 입력에 공격과 제어, 공격과 보호처럼 서로 다른 목적이 각각 명시되거나 강하게 함축될 때만 여러 effect를 병렬 또는 순차로 섞는다. 보조 effect가 주요 사건을 대체해서는 안 된다.
   - 복합 plan·복수 원소·병렬 behavior라는 이유만으로 effect 종류를 늘리지 않는다. 비공격 effect를 넣었다면 반드시 입력의 구체적인 목적이나 결과가 그 effect를 요구해야 하며, 그런 근거를 짚을 수 없으면 damage로 유지한다.

   **창의성 보상**
   - 화려함과 구조적 복잡도는 원소 수나 문장 길이가 아니라 입력이 제공한 서로 구별되는 사건·관계·변화·공간·시간·결말의 밀도에 비례한다.
   - 충돌·융합·합창·포위 같은 관계, 개화·붕괴·부활·분열 같은 변화, 나선·회랑·궤도 같은 공간, 박동·메아리·횟수·지연 같은 시간, 폐막·종말·대관식 같은 결말을 실제 form과 sequence로 가시화한다.
   - 원소 이름이나 화려한 수식어를 나열한 것만으로 사건과 관계를 창작하지 않는다. 반대로 단일 원소라도 입력에 충분한 관계와 변화가 있으면 다원소 영창과 동등하게 풍부한 안무를 구성할 수 있다.
   - 플레이어가 제공하지 않은 사건·effect·원소를 복잡성 확보용으로 추가하지 않는다. behavior 수 자체는 보상이 아니며 각 behavior가 입력의 의미를 담당해야 한다.

   **안무 구조**
   - sequences는 시간 순서다(최대 10). 같은 순간에 시작하는 사건은 같은 sequence의 behaviors로 병렬 배치한다(최대 5).
   - 명시 사건이 6개 이상이라 한 sequence의 최대 5 behavior에 담을 수 없으면 입력의 묶음·순서 근거에 따라 여러 sequence로 나눈다. 근거가 약한 집합은 최대 4개씩 균형 있게 나누며, 어떤 sequence도 5개를 넘기지 않는다.
   - 여러 form을 고른 뒤에는 각각의 관계를 먼저 결정한다. "뒤·그다음·변해·갈라져·끝내"처럼 시간·인과·전환이 있으면 별도 sequence로 나누고, 그러한 근거 없이 같은 장면에 공존·교차·합창·회전·포위·충돌하면 같은 sequence에 병렬 배치한다.
   - 복수 사건이라는 이유만으로 form을 하나씩 별도 sequence에 세우지 않는다. 특히 제목형·시적 입력에서 시간 순서가 읽히지 않으면 순차보다 병렬 한 장면을 먼저 검토한다. 반대로 병렬 비율을 맞추기 위해 인과가 있는 사건을 합치지 않는다.
   - behavior type은 form|wait뿐이다. move는 이 계약에 존재하지 않으며 절대 출력하지 않는다.
   - 일반 sequence는 앞 연출의 꼬리와 다음 연출이 일부 겹친다. 정확한 간격·박자·준비·지연이 의미일 때만 wait-only sequence를 사용한다.
   - wait은 사건이 아니라 사건 사이의 간격이다. 다른 behavior와 섞지 않으며, 단계 수를 늘리거나 반복 사건을 대체하기 위해 쓰지 않는다. N번이 명시되면 실제 form은 N개여야 한다.
   - 동시에 교차·충돌·합창·대비하는 원소나 효과는 같은 sequence의 서로 다른 form으로 병렬 구성한다. 동일 form·원소·effect의 중복은 만들지 않는다.
   - 연사처럼 개별 발사의 박자가 핵심이면 form→wait→form으로 표현한다. 지속 beam·zone·rain 하나가 이미 관계를 표현하면 반복 form이나 wait을 덧붙이지 않는다.

   **시간·예산 계약**
   - durationMs는 전체 plan 요청 시간이며 80~min(3000, 500+power×25) 범위다. 원자 plan은 즉시 발동감을 위해 80ms로 둔다. 순서·반복·지연·전환이 있는 복합 plan은 최소 500ms를 유지한다.
   - durationWeight는 상대 시간 비율이다. 짧은 도입·타격은 1, 형성·지속·전개는 2, 의도적인 긴 대기는 2~3을 사용한다. 서로 다른 사건의 시간 차이를 기계적으로 같은 값으로 평탄화하지 않는다.
   - plan.power는 일반 영창의 전체 품질·위력 예산(30~80)이다. behavior 수 때문에 올리지 않는다. 모든 form은 powerWeight 비율로 이 예산을 나눠 가지며, 보조 1·주요 2·피날레 2~3을 사용한다. spec.power와 spec.cost는 항상 0이다.

   **최종 자체검사와 대조**
   - 최종 출력 전에 각 form이 입력의 사건을 담당하는지, move가 전혀 없는지, wait이 단독 sequence인지, enum과 필수 필드가 유효한지 검사한다.
   - element_primary와 element_secondary는 fire|water|lightning|ice|earth|wind|light|dark 중 하나만 사용한다. 식물·꽃·자연 이미지는 nature 같은 새 원소를 만들지 말고 입력의 역할에 가까운 earth|wind|light|water 중에서 고른다.
   - form은 bolt|beam|slash|wave|nova|rain|wall|cage|orbit|summon|buff|zone|chain 중 하나만 사용한다. 새 enum을 만들지 않는다.
   - "빛의 창"은 form 1개 원자 plan이다. "종이 두 번 울리고 잠시 뒤 다시 울린다"는 form, wait-only, form이다.
   - "팔원소"와 "팔원소 대합창"도 일반 영창에서는 의미 중심적인 원소 2개만 사용한다. 대합창의 창의성은 원소 수가 아니라 선택된 두 원소의 병렬 관계와 수렴 안무, 제한된 power 가점으로 보상한다.
   - "일식의 왈츠"는 빛과 어둠이 함께 회전·교차하는 form들을 같은 sequence에 병렬로 두고, 명시적인 폐막·폭발이 해석될 때만 다음 sequence에 피날레를 둔다. 단일 dark nova로 축약하지 않는다.
   - "파고들어 베고 빠져나온다"는 빠른 slash|beam과 뒤의 dark|wind form으로 진입·베기·이탈의 결과를 표현한다. player move는 만들지 않는다.
   - "최후의 성채"처럼 하나의 지속 방어 이미지로 충분한 입력은 단일 shield|wall이며, 억지 전개 단계를 만들지 않는다.

cast 출력 스키마:
{"schema_version":2,"disposition":"cast","spell_plan":{"name":"명암의 교차","power":78,"durationMs":900,"sequences":[{"durationWeight":2,"behaviors":[{"type":"form","powerWeight":1,"spec":{"name":"회전하는 빛","effect":"damage","target":"area","element_primary":"light","element_secondary":null,"form":"orbit","size":"medium","speed":"fast","status":[],"power":0,"cost":0}},{"type":"form","powerWeight":1,"spec":{"name":"감싸는 어둠","effect":"damage","target":"area","element_primary":"dark","element_secondary":null,"form":"zone","size":"large","speed":"normal","status":[],"power":0,"cost":0}}]},{"durationWeight":1,"behaviors":[{"type":"form","powerWeight":2,"spec":{"name":"일식 폭발","effect":"damage","target":"area","element_primary":"light","element_secondary":"dark","form":"nova","size":"large","speed":"fast","status":[],"power":0,"cost":0}}]}]}}
behavior는 effect가 summon이고 움직임 묘사가 있을 때만 포함한다(그 외 생략). steps는 위 6개 kind만, 최대 6개.
shape는 form이 wall이고 모양 묘사가 있을 때만 포함한다(그 외 생략). kind는 위 6개(arc·line·zigzag·wave·ring·polygon)만.
모든 cast는 대표 spell을 생략하고 spell_plan만 낸다. type은 form|wait뿐이다. plan.power는 전체 품질 판정값이며 spec.power/cost는 0으로 둔다.
fizzle 출력: {"schema_version":2,"disposition":"fizzle","reason":"nonsense","message":"마력이 형태를 이루지 못했다"}
blocked 출력: {"schema_version":2,"disposition":"blocked","reason":"unsafe","message":"해당 문장으로는 영창할 수 없습니다"}

플레이어의 주문:`;

const ULTIMATE_PROMPT = `

[필살영창 모드 — 위 일반 규칙 중 power·원소 수·구성 규모만 아래 계약으로 대체한다]
- 사용자의 핵심 의도와 effect 경계는 보존하되, 입력을 의도적으로 과대해석하여 도입·증폭·병렬 사건·수렴·결말이 있는 장대한 주문으로 확장한다.
- spell_plan.castMode는 반드시 "ultimate", power는 반드시 100, durationMs는 4000~6000으로 낸다.
- sequences는 4~8개, form behavior 총합은 6~12개로 낸다. wait는 form 개수에 포함하지 않는다.
- 적어도 한 sequence에는 서로 다른 form behavior를 2개 이상 병렬 배치하고, 마지막 sequence에는 실제 결말 form을 둔다.
- 별도 근거가 없으면 반드시 다음 기본 골격을 사용한다: sequence 4개, 각 sequence의 form 개수는 순서대로 1개·2개·2개·1개(총 6개). 1단계 도입, 2단계 병렬 증폭, 3단계 병렬 수렴, 4단계 결말이다. 입력이 더 많은 사건을 명확히 요구할 때만 이 골격보다 늘린다.
- 원소는 입력의 단어뿐 아니라 이미지·현상·비유에서 자연스럽게 읽히는 만큼 1~8개를 사용한다. 8개를 억지로 채우거나 맥락 없는 원소를 넣지 않는다.
- element_primary와 element_secondary는 반드시 fire|water|lightning|ice|earth|wind|light|dark 중에서만 고른다. nature·plant·flower 등 새 원소 이름은 절대 만들지 말고 가장 가까운 기존 원소로 해석한다.
- 짧거나 소박한 입력도 그 의도를 훼손하지 않는 범위에서 사건과 관계를 풍성하게 만든다. 현재 입력에서 핵심 전투 목적을 하나 정하되 모든 form의 effect를 기계적으로 같게 만들지 않는다. 각 장면의 물리적·마법적 인과가 분명하면 공격에서 knockback·slow·weaken 같은 control, 구속에서 damage, 보호벽에서 접촉 damage·buff, 치유 영역에서 buff·적 slow처럼 핵심 목적을 보강하는 인접 effect를 허용한다. 별개의 볼거리를 늘리기 위한 근거 없는 heal|shield|buff|control|summon은 추가하지 않는다.
- 순수 보호 필살영창은 shield|buff만 반복하지 말고 최소 하나의 shield wall form을 포함한다. 2단계나 3단계의 병렬 form에는 복수 wall 또는 wall+shield zone을 우선 배치해 전장에 남는 방어 구조를 만든다. wall shape는 arc|line|ring|polygon 등 서로 다른 공간 형태를 활용할 수 있으며, 공격 의도가 없다면 damage를 추가하지 않는다.
- name은 현재 입력을 과대해석한 필살영창 제목(24자 이내)으로 쓴다. interpretation은 출력하지 않는다.
- 실행되지 않는 원소·효과를 name이나 form 이름에 언급하지 않는다.
- sequence 객체에는 durationWeight와 behaviors만 넣는다. caption·description·summary 등 단계 설명 필드는 절대 출력하지 않는다.
- behavior type은 여전히 form|wait뿐이며, sequence당 behavior 최대 5개와 기존 enum은 그대로 지킨다.`;

const RESONANCE_ENUMS = {
  elements: new Set(['fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark']),
  forms: new Set(['bolt', 'beam', 'wave', 'nova', 'rain', 'wall', 'cage', 'orbit', 'summon', 'buff', 'zone', 'chain', 'slash']),
  effects: new Set(['damage', 'heal', 'shield', 'buff', 'control', 'summon']),
};

function sanitizeUltimateResonance(value) {
  if (!value || typeof value !== 'object') return null;
  const pick = (key, limit) => Array.isArray(value[key])
    ? [...new Set(value[key].filter((item) => RESONANCE_ENUMS[key].has(item)))].slice(0, limit)
    : [];
  const recentNames = Array.isArray(value.recentNames)
    ? [...new Set(value.recentNames
      .filter((name) => typeof name === 'string')
      .map((name) => name.trim().slice(0, 30))
      .filter(Boolean))].slice(-3)
    : [];
  const resonance = {
    elements: pick('elements', 4),
    forms: pick('forms', 4),
    effects: pick('effects', 3),
    recentNames,
  };
  return Object.values(resonance).some((items) => items.length > 0) ? resonance : null;
}

function ultimateResonancePrompt(resonance) {
  if (!resonance) return '';
  return `

[ULTIMATE RESONANCE]
The following compact record contains only spells that actually charged the current ultimate gauge:
${JSON.stringify(resonance)}
Most recent contributing spell: ${JSON.stringify(resonance.recentNames.at(-1) ?? '')}
- The current incantation's explicit intent and effect boundaries always have the highest priority.
- The current incantation alone decides the ultimate title, main elements, overall sequence, core purpose, and climax. Resonance is material, never the blueprint.
- When compatible with the current incantation, select only one or two recognizable echo moments from the resonance elements, forms, or recent spell names. An echo occupies one form event or a supporting form in the climax; it must not force the whole plan's primary element, dominant form, title, or finale.
- Prefer transforming the most recent spell as a supporting climax motif when it fits, but never replace the current incantation's own climax with it.
- Resonance effects are descriptive history only. They may justify a causally connected secondary effect, but must not reverse the current incantation's core purpose or introduce an unrelated effect.
- Do not claim an element, form, or effect unless it is actually present in the generated plan.`;
}

function ultimateContractFailure(value) {
  const plan = value?.spell_plan;
  if (value?.disposition !== 'cast' || !plan || !Array.isArray(plan.sequences)) return 'missing-plan';
  const sequences = plan.sequences;
  const forms = sequences.flatMap((sequence) => Array.isArray(sequence?.behaviors)
    ? sequence.behaviors.filter((behavior) => behavior?.type === 'form')
    : []);
  if (sequences.length < 4 || sequences.length > 8) return 'sequence-count';
  if (forms.length < 6 || forms.length > 12) return 'form-count';
  if (!sequences.some((sequence) => sequence?.behaviors?.filter((behavior) => behavior?.type === 'form').length >= 2)) return 'parallel-form';
  if (!sequences.at(-1)?.behaviors?.some((behavior) => behavior?.type === 'form')) return 'missing-finale';
  return null;
}

/** Gemini가 흔히 만드는 비지원 자연 원소 별칭만 기존 enum으로 결정적으로 접는다. */
function normalizeUltimateElementAliases(value) {
  const aliases = { nature: 'earth', plant: 'earth', flower: 'earth' };
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;
  let repairs = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    for (const behavior of sequence.behaviors) {
      if (behavior?.type !== 'form' || !behavior.spec) continue;
      for (const key of ['element_primary', 'element_secondary']) {
        const replacement = aliases[behavior.spec[key]];
        if (!replacement) continue;
        behavior.spec[key] = replacement;
        repairs += 1;
      }
    }
  }
  return repairs;
}

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
- kind가 "evolve"면 baseName을 발전시킨 상위 이름, "fuse"면 elements의 **모든** 원소를 녹인 새 이름 (2개일 수도, 3개 이상일 수도 있다 — 하나도 빠뜨리지 말 것).
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
    let castMode = 'normal';
    let resonance = null;
    try {
      const body = await request.json();
      text = String(body.text ?? '').slice(0, 60);
      castMode = body.castMode === 'ultimate' ? 'ultimate' : 'normal';
      resonance = castMode === 'ultimate' ? sanitizeUltimateResonance(body.resonance) : null;
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

    const judgePrompt = castMode === 'ultimate'
      ? `${JUDGE_PROMPT}${ULTIMATE_PROMPT}${ultimateResonancePrompt(resonance)}`
      : JUDGE_PROMPT;
    let geminiRes = await requestGemini(`${judgePrompt}\n"${text}"`);

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
      return new Response(
        JSON.stringify({ error: 'invalid llm output', retrySuppressed: 'json-syntax' }),
        { status: 502, headers: diagnosticHeaders() },
      );
    }

    if (castMode === 'ultimate') normalizeUltimateElementAliases(parsed);

    const retryableFizzle = parsed?.disposition === 'fizzle' && !isObviousNonsense(text);
    const forbiddenMove = hasMoveSpellPlan(parsed);
    const tooManyElements = castMode === 'normal' && hasTooManySpellPlanElements(parsed);
    const ultimateFailure = castMode === 'ultimate' ? ultimateContractFailure(parsed) : null;
    const unsupportedForm = hasUnsupportedForm(parsed);
    const footstepWithoutDamage = /답보/u.test(text) && !hasDamageFormSpellPlan(parsed);
    const atomicChange = isUnexpectedAtomicChangeCast(parsed, text);
    const retryTriggerReason = retryableFizzle
        ? 'fizzle'
        : forbiddenMove
          ? 'forbidden-move'
          : tooManyElements
            ? 'too-many-elements'
          : unsupportedForm
            ? 'unsupported-form'
            : footstepWithoutDamage
              ? 'footstep-without-damage'
              : ultimateFailure
                ? `ultimate-${ultimateFailure}`
              : atomicChange
              ? 'atomic-change'
                : isWaitOnlySpellPlan(parsed) ? 'wait-only' : null;
    if (retryTriggerReason) {
      retryReason = `suppressed-${retryTriggerReason}`;
    }
    expandRapidFireSingleSpell(parsed, text);
    promoteCastSpellToAtomicPlan(parsed);
    if (castMode === 'ultimate' && parsed?.spell_plan) {
      parsed.spell_plan.castMode = 'ultimate';
      parsed.spell_plan.power = 100;
    } else {
      limitSpellPlanElements(parsed);
      capSpellPlanPower(parsed);
    }
    const normalized = normalizeJudgeOutput(parsed);
    return new Response(JSON.stringify(normalized.value), {
      status: 200,
      headers: diagnosticHeaders(),
    });
  },
};
