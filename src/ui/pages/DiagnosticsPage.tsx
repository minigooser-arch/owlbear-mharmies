import type { DiagnosticTestId } from "../../owlbear/diagnostics";

const TESTS: Array<[DiagnosticTestId, string]> = [
  ["SOURCE_GET", "Получение источника"], ["LOCAL_CREATE", "Создание local item"], ["LOCAL_CHANGE", "Изменение local item"], ["SOURCE_UPDATE", "Обновление источника"], ["BACKGROUND", "Фоновый процесс"], ["CONTEXT_MENU", "Контекстное меню"]
];

export function DiagnosticsPage({ run }: { run(testId: DiagnosticTestId): Promise<unknown> }) {
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Owlbear SDK</p><h2>Диагностика</h2></div></div>
      <p className="muted">Проверки выполняются в текущей комнате. Для части тестов выберите изображение на сцене.</p>
      <div className="card-list">{TESTS.map(([id, title]) => <button className="diagnostic-row" type="button" key={id} onClick={() => void run(id)}><span>{title}</span><span>Запустить →</span></button>)}</div>
    </section>
  );
}
