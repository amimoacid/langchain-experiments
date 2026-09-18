import { redactedFhir } from "./fhir";

type Coding = { code?: string; display?: string };

type Answer = {
  valueInteger?: number;
  valueString?: string;
  valueBoolean?: boolean;
};

type Resource = {
  resourceType?: string;
  id?: string;
  code?: { coding?: Coding[]; text?: string };
  medicationCodeableConcept?: { coding?: Coding[] };
  valueQuantity?: { value?: number; unit?: string };
  valueString?: string;
  interpretation?: { coding?: Coding[] }[];
  referenceRange?: { text?: string }[];
  class?: { code?: string; display?: string };
  type?: { text?: string }[];
  status?: string;
  receivedTime?: string;
  effectiveDateTime?: string;
  authoredOn?: string;
  authored?: string;
  issued?: string;
  recordedDate?: string;
  period?: { start?: string; end?: string };
  dosageInstruction?: { text?: string }[];
  note?: { text?: string }[];
  statusReason?: { text?: string };
  reasonCode?: { text?: string }[];
  item?: { linkId?: string; text?: string; answer?: Answer[] }[];
  title?: string;
  description?: string;
  conclusion?: string;
  restriction?: { period?: { start?: string; end?: string } };
  component?: {
    code?: { text?: string };
    valueQuantity?: { value?: number; unit?: string };
  }[];
  objective?: { name?: string }[];
};

function resources() {
  return redactedFhir.entry.map((item) => item.resource as Resource);
}

function codingOf(resource: Resource) {
  return (
    resource.code?.coding?.[0] ??
    resource.medicationCodeableConcept?.coding?.[0] ??
    null
  );
}

function firstNote(resource: Resource) {
  return resource.note?.[0]?.text ?? "";
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return (
    Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) /
    10
  );
}

function answerOf(answer?: Answer) {
  if (!answer) return "";
  if (typeof answer.valueInteger === "number") return String(answer.valueInteger);
  if (typeof answer.valueBoolean === "boolean") {
    return answer.valueBoolean ? "yes" : "no";
  }
  return answer.valueString ?? "";
}

function itemsOf(resource: Resource) {
  return (resource.component ?? [])
    .map((part) => {
      const name = part.code?.text ?? "";
      const value = part.valueQuantity?.value;
      if (!name || typeof value !== "number") return "";
      return `${name} ${value}`;
    })
    .filter(Boolean);
}

/** Deterministic counts from the redacted bundle. No names. */
export function aggregateFhir() {
  const started = Date.now();
  const list = resources();
  const counts: Record<string, number> = {};
  for (const resource of list) {
    const kind = resource.resourceType ?? "Unknown";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }

  const conditions = list
    .filter((resource) => resource.resourceType === "Condition")
    .map((resource) => {
      const coding = codingOf(resource);
      return {
        code: coding?.code ?? "",
        display: coding?.display ?? "",
        recorded: resource.recordedDate ?? "",
        note: firstNote(resource),
      };
    });

  const medications = list
    .filter((resource) => resource.resourceType === "MedicationRequest")
    .map((resource) => {
      const coding = codingOf(resource);
      return {
        code: coding?.code ?? "",
        display: coding?.display ?? "",
        status: resource.status ?? "",
        dose: resource.dosageInstruction?.[0]?.text ?? "",
        authoredOn: resource.authoredOn ?? "",
        change: firstNote(resource) || resource.statusReason?.text || "",
      };
    });

  const series = list
    .filter((resource) => resource.resourceType === "Observation")
    .map((resource) => {
      const coding = codingOf(resource);
      const value = resource.valueQuantity?.value;
      return {
        code: coding?.code ?? "",
        display: coding?.display ?? resource.code?.text ?? "",
        value: typeof value === "number" ? value : undefined,
        text: resource.valueString ?? "",
        unit: resource.valueQuantity?.unit ?? "",
        date: resource.effectiveDateTime ?? "",
        issued: resource.issued ?? "",
        flag: resource.interpretation?.[0]?.coding?.[0]?.display ?? "",
        range: resource.referenceRange?.[0]?.text ?? "",
        items: itemsOf(resource),
        note: firstNote(resource),
      };
    });

  const byCode = new Map<string, number[]>();
  for (const row of series) {
    if (!row.code || typeof row.value !== "number") continue;
    const bucket = byCode.get(row.code) ?? [];
    bucket.push(row.value);
    byCode.set(row.code, bucket);
  }
  const observations = [...byCode.entries()].map(([code, values]) => ({
    code,
    n: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: mean(values),
  }));

  const adl = series
    .filter((row) => row.code === "75859-8" && typeof row.value === "number")
    .map((row) => ({
      date: row.date,
      score: row.value as number,
      items: row.items,
      note: row.note,
    }));

  const labs = series.filter(
    (row) => row.code === "20427-8" || row.code === "2157-6",
  );

  const current = series.find((row) => row.display === "patient-reported status");

  const encounters = list
    .filter((resource) => resource.resourceType === "Encounter")
    .map((resource) => ({
      class: resource.class?.code ?? "",
      type: resource.type?.[0]?.text ?? "",
      date: resource.period?.start ?? "",
      reason: resource.reasonCode?.[0]?.text ?? "",
    }));

  const surveys = list
    .filter((resource) => resource.resourceType === "QuestionnaireResponse")
    .map((resource) => ({
      status: resource.status ?? "",
      authored: resource.authored ?? "",
      answers: (resource.item ?? []).map((item) => ({
        question: item.text ?? item.linkId ?? "",
        answer: answerOf(item.answer?.[0]),
      })),
    }));

  const studyMeta = list.find(
    (resource) => resource.resourceType === "ResearchStudy",
  );
  const report = list.find(
    (resource) => resource.resourceType === "DiagnosticReport",
  );
  const samples = list.filter((resource) => resource.resourceType === "Specimen");
  const tasks = list
    .filter((resource) => resource.resourceType === "Task")
    .map((resource) => ({
      name: resource.code?.text ?? "",
      status: resource.status ?? "",
      due: resource.restriction?.period?.end ?? "",
      opens: resource.restriction?.period?.start ?? "",
      detail: resource.description ?? "",
    }));
  const next = tasks.find((task) => task.status === "in-progress") ?? tasks[0];

  return {
    ok: true as const,
    ms: Date.now() - started,
    snippet: "aggregateFhir(redactedBundle)",
    tokens: { input: 0, output: 0, total: 0 },
    value: {
      redaction:
        "PHI and PII are removed. IDs are tokens. Age is a band. Visit dates use year-month-day as study labels.",
      ageBand: "45-49",
      place: "Chicago, IL",
      counts,
      conditions,
      medications,
      observations,
      adl,
      labs,
      current: current
        ? { date: current.date, text: current.text }
        : null,
      encounters,
      surveys,
      study: {
        title: studyMeta?.title ?? "MG cohort study",
        purpose: studyMeta?.description ?? "",
        aims: (studyMeta?.objective ?? [])
          .map((item) => item.name ?? "")
          .filter(Boolean),
        surveysCompleted: surveys.filter((item) => item.status === "completed")
          .length,
        surveysOpen: surveys.filter((item) => item.status === "in-progress")
          .length,
        samplesReceived: samples.filter((item) => item.status === "available")
          .length,
        sampleResult: report?.conclusion ?? "",
        tasks,
        nextTask: next?.name ?? "",
        nextDue: next?.due ?? "",
      },
    },
  };
}
