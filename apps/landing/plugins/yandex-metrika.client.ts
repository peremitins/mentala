/**
 * Подключает счётчик Яндекс.Метрики на лендинге (только клиент).
 * Работает только если в runtimeConfig.public.yandexMetrikaId задан ID счётчика.
 * Используется официальный код загрузки счётчика (mc.yandex.ru).
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const id = config.public.yandexMetrikaId;
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return;
  }

  const counterId = id.trim();
  const counterNum = Number(counterId);
  if (!Number.isFinite(counterNum)) {
    return;
  }

  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  // Официальный фрагмент кода счётчика + init с нашими параметрами
  const scriptContent = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${counterNum},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`;

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = scriptContent;
  script.async = true;
  const first = document.getElementsByTagName('script')[0];
  if (first && first.parentNode) {
    first.parentNode.insertBefore(script, first);
  } else {
    document.head.appendChild(script);
  }
});
