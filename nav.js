// ---- language switch (KO / EN) ----
// 페이지 안의 .ko-only / .en-only 요소를 CSS로 전환하고 선택을 localStorage에 저장한다.
(function(){
  const KEY = 'o2c-lang';
  const root = document.documentElement;

  function apply(lang){
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang === 'en' ? 'en' : 'ko');
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.langSet === lang));
    });
  }

  // 저장된 선택이 없으면 브라우저 언어와 무관하게 영어로 시작한다
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch(e){}
  apply((saved === 'ko' || saved === 'en') ? saved : 'en');

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.langSet;
      try { localStorage.setItem(KEY, lang); } catch(e){}
      apply(lang);
    });
  });
})();

// ---- header background on scroll ----
const header = document.getElementById('site-header');
if(header){
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
    setHeaderHeight();
  }, { passive:true });
}

// ---- 헤더 실제 높이를 CSS 변수로 전달 ----
// 화면이 좁아지면 메뉴가 여러 줄로 접혀 헤더가 높아진다.
// 배너가 헤더에 가려지지 않도록 실제 높이를 재서 --header-h 에 넣는다.
function setHeaderHeight(){
  if(!header) return;
  document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}
setHeaderHeight();
window.addEventListener('resize', setHeaderHeight, { passive:true });
window.addEventListener('load', setHeaderHeight);

// ---- 좁은 화면용 햄버거 메뉴 ----
const navToggle = document.querySelector('.nav-toggle');
if(navToggle && header){
  const setOpen = (open) => {
    header.classList.toggle('nav-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };

  navToggle.addEventListener('click', () => {
    setOpen(!header.classList.contains('nav-open'));
  });

  // 메뉴 항목을 고르면 닫는다
  document.querySelectorAll('.navlinks a').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });

  // 바깥을 누르거나 넓은 화면으로 돌아가면 닫는다
  document.addEventListener('click', (e) => {
    if(header.classList.contains('nav-open') && !header.contains(e.target)) setOpen(false);
  });
  window.addEventListener('resize', () => {
    if(window.innerWidth > 1024) setOpen(false);
  }, { passive:true });
}
