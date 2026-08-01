// 1. 카드 상태 객체 (Data Model - 상태 주도 렌더링)
const cardState = {
    bgColor: '#1a4e76',           // 배경 색상
    slogan: '시민 주도 참여형 예산의 시작', // 메인 슬로건
    candidateName: '김동연',        // 후보자 이름
    profileImg: './assets/profile.png', // 인물 사진 경로 (투명 배경 PNG 권장)
    logoImg: './assets/logo.png'        // 로고 이미지 경로
};

// 2. 캔버스 및 컨텍스트 초기화
// (index.html에 <canvas id="cardCanvas">가 있다고 가정합니다)
const canvas = document.querySelector('canvas') || document.getElementById('cardCanvas');
const ctx = canvas.getContext('2d');

// 카드뉴스 규격에 맞게 캔버스 크기 고정 (예: 800x800 정방형)
canvas.width = 800;
canvas.height = 800;

// 3. 이미지 비동기 로딩을 위한 유틸리티 함수
// 이미지가 완전히 로드될 때까지 기다려주는 역할을 합니다.
function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn(`이미지를 찾을 수 없습니다: ${src}`);
            resolve(null); // 에러가 나도 렌더링이 멈추지 않도록 null 반환
        };
        img.src = src;
    });
}

// 4. 메인 렌더링 함수 (비동기 처리)
async function renderCard() {
    // [A] 캔버스 초기화 및 배경색 칠하기
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = cardState.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // [B] 이미지 에셋 동시 로드 대기
    const [profileImg, logoImg] = await Promise.all([
        loadImage(cardState.profileImg),
        loadImage(cardState.logoImg)
    ]);

    // [C] 로고 이미지 그리기 (좌측 상단 배치 예시)
    if (logoImg) {
        const logoWidth = 120;
        const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
        ctx.drawImage(logoImg, 40, 40, logoWidth, logoHeight);
    }

    // [D] 인물 사진 그리기 (우측 하단 배치 예시)
    if (profileImg) {
        const imgWidth = 450;
        const imgHeight = (profileImg.height / profileImg.width) * imgWidth;
        const x = canvas.width - imgWidth;
        const y = canvas.height - imgHeight;
        ctx.drawImage(profileImg, x, y, imgWidth, imgHeight);
    }

    // [E] 텍스트 그리기 (이미지 위에 얹혀지도록 가장 마지막에 렌더링)

    // 슬로건 텍스트
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cardState.slogan, canvas.width / 2, 180);

    // 후보자 이름 텍스트
    ctx.fillStyle = '#fbbc04';
    ctx.font = 'bold 72px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    // 인물 사진을 가리지 않도록 좌측 하단 쪽에 배치하는 예시
    ctx.fillText(cardState.candidateName, canvas.width / 3, canvas.height - 100);
}

// 5. 초기 화면 렌더링 실행
renderCard();

// 6. UI 컨트롤러 연동 (새로고침 버튼 등)
// 좌측 패널의 입력값을 cardState에 반영하고 렌더링 함수를 다시 호출하는 로직을 여기에 연결합니다.
// 예시:
// document.getElementById('renderBtn').addEventListener('click', () => {
//     cardState.slogan = document.getElementById('sloganInput').value;
//     renderCard();
// });

// 저장 버튼 요소를 가져옵니다. (실제 HTML의 저장 버튼 ID로 변경해 주세요)
const saveButton = document.getElementById('save-btn');

saveButton.addEventListener('click', async () => {
    // 1. localStorage에서 로그인한 사용자 ID 꺼내기
    const userId = localStorage.getItem('userId');

    // 만약 ID가 없다면 (로그인이 풀렸거나 비정상 접근) 로그인 페이지로 돌려보냄
    if (!userId) {
        alert('로그인 정보가 없습니다. 다시 로그인해 주세요.');
        window.location.href = '/login.html';
        return;
    }

    // 2. 에디터에서 작성한 제목과 내용 가져오기 
    // (실제 HTML의 입력창 ID에 맞게 수정해 주세요)
    const title = document.getElementById('title-input').value;
    const content = document.getElementById('content-input').value;

    try {
        // 3. 백엔드 창고(/api/cards)로 데이터 쏘기
        const response = await fetch('/api/cards', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                title: title,
                content: content
            })
        });

        if (response.ok) {
            const data = await response.json();
            alert('성공적으로 저장되었습니다!');
            console.log('서버 응답:', data);
        } else {
            alert('저장에 실패했습니다. 다시 시도해 주세요.');
        }
    } catch (error) {
        console.error('서버 통신 중 에러:', error);
        alert('서버와 연결할 수 없습니다.');
    }
});