const videoUrl = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
const social = { facebook:'https://www.facebook.com/', youtube:'https://www.youtube.com/', instagram:'https://www.instagram.com/', blog:'https://blog.naver.com/' };
const photos = {
  community:'/assets/politician-mobile-card-samples/assets/seo-rin.png',
  policy:'/assets/politician-mobile-card-samples/assets/min-seok.png',
  creator:'/assets/profile-samples/fictional-han-soyeon-creator.png',
  consultant:'/assets/politician-mobile-card-samples/assets/ga-eun.png',
  portfolio:'/assets/politician-mobile-card-samples/assets/yu-jin.png',
  trainer:'/assets/profile-samples/candidate-lee-dohyun.png',
  content:'/assets/politician-mobile-card-samples/assets/do-yoon.png'
};
const configs = {
  'sample-community': {
    key:'community', name:'김도윤', role:'새봄동 주민 커뮤니티 활동가', tagline:'우리 동네의 든든한 이웃',
    bio:'돌봄이 필요한 순간과 도움이 가능한 사람을 연결해, 누구도 혼자 남지 않는 동네를 만듭니다.',
    video:['주민이 만드는 변화','골목 돌봄 거점의 하루를 영상으로 만나보세요.'],
    cards:[['아이 돌봄 품앗이','등하교 동행과 긴급 돌봄을 이웃이 함께 연결합니다.'],['어르신 안부 네트워크','상점과 주민이 함께 주 2회 안부를 살핍니다.'],['청소년 열린 작업실','방과 후 배우고 만들 수 있는 동네 공간을 운영합니다.']],
    pledges:[['돌봄 연결','긴급 돌봄 요청에 30분 안에 답하겠습니다.'],['안전 지도','주민 제보 위험 구간을 매달 공개하겠습니다.'],['열린 회의','모든 사업과 지출을 주민에게 공유하겠습니다.']]
  },
  'sample-policy': {
    key:'policy', name:'이준혁', role:'도시정책 데이터 연구자', tagline:'숫자 뒤에 있는 생활을 봅니다',
    bio:'복잡한 지역 현안을 시민의 언어로 설명하고, 근거와 실행 일정을 함께 공개합니다.',
    video:['이번 주 3분 정책 브리핑','교통·돌봄·상권 회복의 핵심 지표를 알기 쉽게 정리했습니다.'],
    cards:[['출근길 평균 18분 단축','환승 동선을 조정해 생활권 이동 시간을 줄입니다.'],['돌봄 공백 1,240시간','수요가 몰리는 시간대에 인력과 공간을 집중 배치합니다.'],['빈 점포 37곳 연결','청년 실험 매장과 주민 편의시설로 전환합니다.']],
    pledges:[['교통','분기별 평균 이동시간을 공개하겠습니다.'],['돌봄','대기 인원과 해소 일정을 매월 알리겠습니다.'],['상권','공실 활용률과 매출 변화를 함께 점검하겠습니다.']]
  },
  'sample-creator': {
    key:'creator', name:'한소연', role:'브랜드 필름 크리에이터', tagline:'사람이 기억하는 장면을 만듭니다',
    bio:'브랜드의 진짜 이야기를 찾고, 짧지만 오래 남는 영상과 이미지로 기록합니다.',
    video:['2026 Director’s Reel','브랜드 필름과 인터뷰 프로젝트의 주요 장면을 만나보세요.'],
    cards:[['LOCAL TABLE','지역 생산자의 하루를 담은 푸드 브랜드 필름.'],['A QUIET MORNING','빛의 움직임을 기록한 라이프스타일 캠페인.'],['MAKERS 12','열두 명의 창작자를 소개하는 인터뷰 시리즈.']],
    pledges:[['Discover','브랜드의 핵심 장면과 목소리를 찾습니다.'],['Create','하나의 콘셉트로 촬영과 디자인을 연결합니다.'],['Deliver','채널별 규격에 맞는 결과물을 제공합니다.']]
  },
  'sample-consultant': {
    key:'consultant', name:'박지현', role:'경영·조직 컨설턴트', tagline:'복잡한 문제를 실행 가능한 계획으로',
    bio:'전략이 문서에 머물지 않도록 조직의 언어와 일하는 방식을 함께 바꿉니다.',
    video:['변화가 멈추는 세 가지 이유','현장에서 자주 만나는 실행 실패의 원인을 설명합니다.'],
    cards:[['조직 진단','인터뷰와 데이터로 병목과 핵심 과제를 찾습니다.'],['전략 실행 체계','목표, 역할, 회의, 지표를 하나로 연결합니다.'],['리더십 코칭','팀이 스스로 답을 찾는 구조를 만듭니다.']],
    pledges:[['Diagnose','현장의 사실에서 시작합니다.'],['Design','실행 주체와 일정을 명확히 합니다.'],['Deliver','성과가 습관이 될 때까지 함께합니다.']]
  },
  'sample-portfolio': {
    key:'portfolio', name:'서하린', role:'브랜드 아이덴티티 디자이너', tagline:'조용하지만 분명한 첫인상',
    bio:'이름, 색, 글자, 이미지가 하나의 목소리로 느껴지도록 브랜드의 첫 장면을 설계합니다.',
    video:['How we shape a brand','리서치부터 최종 시스템까지의 과정을 소개합니다.'],
    cards:[['MORNING ARCHIVE','일상의 기록을 위한 문구 브랜드.'],['ROOM 607','도심 속 작은 스테이를 위한 공간 브랜딩.'],['GARDEN TABLE','제철의 맛을 전하는 다이닝 브랜드.']],
    pledges:[['Listen','브랜드가 가진 고유한 이야기를 듣습니다.'],['Define','방향과 원칙을 한 문장으로 정리합니다.'],['Design','오래 사용할 수 있는 시각 시스템을 만듭니다.']]
  },
  'sample-trainer': {
    key:'trainer', name:'이도현', role:'푸른시 도의원 후보', tagline:'청년의 시작이 멈추지 않도록',
    bio:'주거·일자리·문화가 이어지는 도시를 만들고, 약속의 진행 상황을 시민에게 공개하겠습니다.',
    video:['청년이 머무는 도시의 조건','주거와 일자리 정책을 3분 안에 설명드립니다.'],
    cards:[['첫 일자리 지역 매칭','지역 기업과 청년을 연결하고 1년의 성장을 관리합니다.'],['안심 주거 상담센터','계약부터 분쟁까지 무료 상담 창구를 만듭니다.'],['청년 문화패스','지역 문화공간을 부담 없이 이용하도록 지원합니다.']],
    pledges:[['일자리','참여 기업과 채용 결과를 분기마다 공개합니다.'],['주거','피해 상담과 해결 결과를 익명 통계로 알립니다.'],['문화','이용률을 확인해 원하는 프로그램을 확대합니다.']], certificate:true
  },
  'sample-content-director': {
    key:'content', name:'오유진', role:'새봄동 주민소통위원장', tagline:'듣고, 기록하고, 답하겠습니다',
    bio:'주민의 작은 제안도 공개적으로 검토해 동네의 변화로 연결합니다.',
    video:['골목에서 만난 사람들','주민이 말하는 불편과 바라는 변화를 직접 들어보세요.'],
    cards:[['어두운 골목에 불이 켜졌습니다','주민 제보를 모아 안전 조명 7개를 설치했습니다.'],['주말에도 열린 돌봄방','유휴공간에서 토요일 돌봄을 시작했습니다.'],['상인과 함께 만든 쉼터','시장 입구의 빈 공간을 주민 쉼터로 바꿨습니다.']],
    pledges:[['48시간 답변','접수 여부와 담당자를 먼저 안내합니다.'],['월간 공개','제안의 검토 상태를 매달 공개합니다.'],['현장 확인','책상보다 현장에서 먼저 답을 찾겠습니다.']], certificate:true
  }
};
const makePage = (id,type,title,heading,body,extra={}) => ({id,type,title,heading,body,image:'',videoUrl:'',buttonLabel:'',buttonUrl:'',...extra});
module.exports = Object.fromEntries(Object.entries(configs).map(([slug,c],sampleIndex)=>{
  const pages=[
    makePage('intro','intro','소개',c.tagline,c.bio),
    makePage('video','video','대표 영상',c.video[0],c.video[1],{videoUrl}),
    ...c.cards.map((item,index)=>makePage(`card-${index+1}`,'custom','카드 스토리',item[0],item[1])),
    makePage('pledge','pledge','핵심 약속','세 가지 약속',c.pledges.map(item=>`${item[0]}: ${item[1]}`).join('\n'))
  ];
  if(c.certificate) pages.push(makePage('certificate','certificate','함께하기','함께 만드는 변화','소식 구독과 참여를 신청해 주세요.'));
  return [slug,{
    name:c.name,role:c.role,tagline:c.tagline,bio:c.bio,photo:photos[c.key],
    phone:`010-1200-34${String(sampleIndex+1).padStart(2,'0')}`,email:`sample${sampleIndex+1}@example.local`,
    social,inquiryUrl:`https://example.com/${c.key}/contact`,
    links:[{label:'자세히 알아보기',url:`https://example.com/${c.key}`},{label:'의견·문의 보내기',url:`https://example.com/${c.key}/contact`}],
    portfolio:[],
    resources:[],pages
  }];
}));
