import type { Metadata } from "next";
import { ManualPage } from "./ManualPage";

export const metadata: Metadata = {
  title: "Manual do Sistema",
  description:
    "Documentação completa do FinanceDash: startup, configurações, painéis, cálculos e APIs.",
  robots: { index: false, follow: false }, // documentação interna
};

export default function Manual() {
  return <ManualPage />;
}
