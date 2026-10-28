import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartTooltip } from "./AttendantsPage";

const data = [
  { month: "2026-08", Suelen: 97, Amanda: 74, Thais: 56, Tamires: 29 },
  { month: "2026-09", Suelen: 87, Amanda: 71, Thais: 56, Tamires: 34 },
] as never;

const payload = [
  { dataKey: "Suelen", name: "Suelen", color: "#e5487f", value: 87 },
  { dataKey: "Amanda", name: "Amanda", color: "#d94b45", value: 71 },
  { dataKey: "Thais", name: "Thais", color: "#7c4dd8", value: 56 },
  { dataKey: "Tamires", name: "Tamires", color: "#3fbf7f", value: 34 },
];

export function renderTooltip() {
  return renderToStaticMarkup(
    <ChartTooltip active payload={payload} label="2026-09" metric={"uniqueCustomers" as never} data={data} currentMonth="2026-10" />,
  );
}

describe("tooltip do grafico de atendentes", () => {
  it("e compacto: uma linha por atendente com valor, variacao e mes anterior", () => {
    const html = renderTooltip();
    expect(html).toContain("attendant-tip");
    expect(html).not.toContain("attendant-chart-gauge");
    expect(html).toContain("mês fechado");
    expect(html).toContain("Suelen");
    expect(html).toContain("▼ 10,3%");
    expect(html).toContain("▲ 17,2%");
    expect(html).toContain("antes 97");
    expect(html.match(/attendant-tip-row/g)).toHaveLength(4);
  });
});
