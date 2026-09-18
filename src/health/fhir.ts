/** Redacted FHIR R4-style bundle. Names, addresses, phones, and exact birthdays are absent. */

export const redactedFhir = {
  resourceType: "Bundle",
  type: "collection",
  meta: {
    tag: [{ system: "https://example.org/redaction", code: "phi-removed" }],
  },
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "pat-7f3a9c",
        gender: "female",
        extension: [{ url: "age-band", valueString: "45-49" }],
        address: [{ city: "Chicago", state: "IL", country: "US" }],
      },
    },
    {
      resource: {
        resourceType: "ResearchStudy",
        id: "study-mg-1",
        status: "active",
        title: "MG cohort study",
        description:
          "The study compares monthly MG-ADL scores, monthly symptom surveys, and scheduled blood tests across people with myasthenia gravis. The study team looks at group patterns. This file does not change clinic medicine by itself.",
        objective: [
          {
            name: "Track how daily tasks and fatigue change from month to month.",
          },
          {
            name: "Relate AChR antibody results to survey and MG-ADL scores as a group.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "ResearchSubject",
        id: "subj-mg-1",
        status: "on-study",
        study: {
          reference: "ResearchStudy/study-mg-1",
          display: "MG cohort study",
        },
        individual: { reference: "Patient/pat-7f3a9c" },
        period: { start: "2025-11-03" },
      },
    },
    {
      resource: {
        resourceType: "Condition",
        id: "cond-mg",
        subject: { reference: "Patient/pat-7f3a9c" },
        code: {
          coding: [
            {
              system: "http://hl7.org/fhir/sid/icd-10-cm",
              code: "G70.00",
              display: "Myasthenia gravis without (acute) exacerbation",
            },
          ],
        },
        clinicalStatus: { coding: [{ code: "active" }] },
        recordedDate: "2021-06-14",
        note: [
          {
            text: "No acute flare code is in this file. That does not prove how you feel today.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "Condition",
        id: "cond-fatigue",
        subject: { reference: "Patient/pat-7f3a9c" },
        code: {
          coding: [
            {
              system: "http://hl7.org/fhir/sid/icd-10-cm",
              code: "R53.83",
              display: "Other fatigue",
            },
          ],
        },
        clinicalStatus: { coding: [{ code: "active" }] },
        recordedDate: "2025-11-03",
        note: [
          {
            text: "Fatigue is listed as active. Afternoon tiredness is the main pattern in later surveys.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "med-pyridostigmine",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "active",
        authoredOn: "2021-07-01",
        medicationCodeableConcept: {
          coding: [
            {
              system: "http://www.nlm.nih.gov/research/umls/rxnorm",
              code: "9068",
              display: "pyridostigmine",
            },
          ],
        },
        dosageInstruction: [
          {
            text: "60 mg by mouth 3 times a day",
            timing: { repeat: { frequency: 3, period: 1, periodUnit: "d" } },
            route: { text: "oral" },
            doseAndRate: [
              { doseQuantity: { value: 60, unit: "mg" } },
            ],
          },
        ],
        note: [{ text: "No dose change is listed after 2021-07-01." }],
      },
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "med-prednisone-20",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "stopped",
        authoredOn: "2025-12-01",
        medicationCodeableConcept: {
          coding: [
            {
              system: "http://www.nlm.nih.gov/research/umls/rxnorm",
              code: "8640",
              display: "prednisone",
            },
          ],
        },
        dosageInstruction: [
          {
            text: "20 mg by mouth once a day",
            timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } },
            route: { text: "oral" },
            doseAndRate: [
              { doseQuantity: { value: 20, unit: "mg" } },
            ],
          },
        ],
        statusReason: { text: "Dose reduced on 2026-08-12." },
      },
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "med-prednisone-15",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "active",
        authoredOn: "2026-08-12",
        medicationCodeableConcept: {
          coding: [
            {
              system: "http://www.nlm.nih.gov/research/umls/rxnorm",
              code: "8640",
              display: "prednisone",
            },
          ],
        },
        dosageInstruction: [
          {
            text: "15 mg by mouth once a day",
            timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } },
            route: { text: "oral" },
            doseAndRate: [
              { doseQuantity: { value: 15, unit: "mg" } },
            ],
          },
        ],
        note: [
          {
            text: "Reduced from 20 mg daily to 15 mg daily at the 2026-08-12 neurology visit.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-adl-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: {
          coding: [
            { system: "http://loinc.org", code: "75859-8", display: "MG-ADL" },
          ],
        },
        valueQuantity: { value: 6, unit: "score" },
        effectiveDateTime: "2026-07-12",
        component: [
          { code: { text: "eyelid droop" }, valueQuantity: { value: 2, unit: "score" } },
          { code: { text: "double vision" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "talking" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "chewing" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "swallowing" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "breathing" }, valueQuantity: { value: 0, unit: "score" } },
          { code: { text: "brush teeth or comb hair" }, valueQuantity: { value: 0, unit: "score" } },
          { code: { text: "arise from a chair" }, valueQuantity: { value: 0, unit: "score" } },
        ],
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-adl-2",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: {
          coding: [
            { system: "http://loinc.org", code: "75859-8", display: "MG-ADL" },
          ],
        },
        valueQuantity: { value: 8, unit: "score" },
        effectiveDateTime: "2026-08-09",
        component: [
          { code: { text: "eyelid droop" }, valueQuantity: { value: 2, unit: "score" } },
          { code: { text: "double vision" }, valueQuantity: { value: 2, unit: "score" } },
          { code: { text: "talking" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "chewing" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "swallowing" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "breathing" }, valueQuantity: { value: 0, unit: "score" } },
          { code: { text: "brush teeth or comb hair" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "arise from a chair" }, valueQuantity: { value: 0, unit: "score" } },
        ],
        note: [
          {
            text: "Score rose 2 points from 2026-07-12. Eye tasks and hair care were harder.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-adl-3",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: {
          coding: [
            { system: "http://loinc.org", code: "75859-8", display: "MG-ADL" },
          ],
        },
        valueQuantity: { value: 7, unit: "score" },
        effectiveDateTime: "2026-09-06",
        component: [
          { code: { text: "eyelid droop" }, valueQuantity: { value: 2, unit: "score" } },
          { code: { text: "double vision" }, valueQuantity: { value: 2, unit: "score" } },
          { code: { text: "talking" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "chewing" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "swallowing" }, valueQuantity: { value: 1, unit: "score" } },
          { code: { text: "breathing" }, valueQuantity: { value: 0, unit: "score" } },
          { code: { text: "brush teeth or comb hair" }, valueQuantity: { value: 0, unit: "score" } },
          { code: { text: "arise from a chair" }, valueQuantity: { value: 0, unit: "score" } },
        ],
        note: [
          {
            text: "Score fell 1 point from 2026-08-09. Hair care returned to 0. Eye tasks stayed hard. Breathing stayed 0.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-status-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: { text: "patient-reported status" },
        effectiveDateTime: "2026-09-16",
        valueString:
          "More tired in the afternoon. No new trouble swallowing. Eyelid droop is still there. No breathing worry.",
      },
    },
    {
      resource: {
        resourceType: "Encounter",
        id: "enc-neuro-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "finished",
        class: { code: "AMB", display: "ambulatory" },
        type: [{ text: "neurology follow-up" }],
        period: { start: "2026-08-12", end: "2026-08-12" },
        reasonCode: [{ text: "Routine MG review. No crisis visit." }],
        diagnosis: [{ condition: { display: "G70.00" } }],
      },
    },
    {
      resource: {
        resourceType: "Encounter",
        id: "enc-lab-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "finished",
        class: { code: "AMB", display: "ambulatory" },
        type: [{ text: "specimen collection" }],
        period: { start: "2026-09-04", end: "2026-09-04" },
        reasonCode: [{ text: "Scheduled study blood draw." }],
      },
    },
    {
      resource: {
        resourceType: "Specimen",
        id: "spec-blood-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        type: { text: "blood" },
        status: "available",
        receivedTime: "2026-09-04",
        collection: { collectedDateTime: "2026-09-04" },
        note: [{ text: "Study blood draw at the specimen visit." }],
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-achr-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "20427-8",
              display: "AChR binding antibody",
            },
          ],
        },
        valueQuantity: { value: 8.4, unit: "nmol/L" },
        effectiveDateTime: "2026-09-04",
        issued: "2026-09-11",
        interpretation: [{ coding: [{ code: "H", display: "High" }] }],
        referenceRange: [{ text: "0-0.4 nmol/L" }],
        specimen: { reference: "Specimen/spec-blood-1" },
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-ck-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "2157-6",
              display: "Creatine kinase",
            },
          ],
        },
        valueQuantity: { value: 95, unit: "U/L" },
        effectiveDateTime: "2026-09-04",
        issued: "2026-09-11",
        interpretation: [{ coding: [{ code: "N", display: "Normal" }] }],
        referenceRange: [{ text: "30-200 U/L" }],
        specimen: { reference: "Specimen/spec-blood-1" },
      },
    },
    {
      resource: {
        resourceType: "DiagnosticReport",
        id: "dr-blood-1",
        subject: { reference: "Patient/pat-7f3a9c" },
        status: "final",
        code: { text: "Study blood panel" },
        effectiveDateTime: "2026-09-04",
        issued: "2026-09-11",
        specimen: [{ reference: "Specimen/spec-blood-1" }],
        result: [
          { reference: "Observation/obs-achr-1" },
          { reference: "Observation/obs-ck-1" },
        ],
        conclusion:
          "AChR binding antibody is above the local reference range. Creatine kinase is in the local reference range. The study team uses these values with the group, not as a new diagnosis on this page.",
      },
    },
    {
      resource: {
        resourceType: "QuestionnaireResponse",
        id: "qr-jul-1",
        status: "completed",
        authored: "2026-07-14",
        questionnaire: "Questionnaire/monthly-mg",
        item: [
          {
            linkId: "energy",
            text: "Energy today. 1 is very tired. 5 is usual energy.",
            answer: [{ valueInteger: 4 }],
          },
          {
            linkId: "afternoonCrash",
            text: "Do afternoons feel much harder than mornings?",
            answer: [{ valueBoolean: false }],
          },
          {
            linkId: "swallowingChange",
            text: "Any new trouble swallowing?",
            answer: [{ valueBoolean: false }],
          },
          {
            linkId: "breathingWorry",
            text: "Any new breathing worry?",
            answer: [{ valueBoolean: false }],
          },
          {
            linkId: "note",
            text: "One sentence about this month.",
            answer: [{ valueString: "Mornings were usable. Eyes were the main bother." }],
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "QuestionnaireResponse",
        id: "qr-aug-1",
        status: "completed",
        authored: "2026-08-10",
        questionnaire: "Questionnaire/monthly-mg",
        item: [
          {
            linkId: "energy",
            text: "Energy today. 1 is very tired. 5 is usual energy.",
            answer: [{ valueInteger: 2 }],
          },
          {
            linkId: "afternoonCrash",
            text: "Do afternoons feel much harder than mornings?",
            answer: [{ valueBoolean: true }],
          },
          {
            linkId: "swallowingChange",
            text: "Any new trouble swallowing?",
            answer: [{ valueBoolean: false }],
          },
          {
            linkId: "breathingWorry",
            text: "Any new breathing worry?",
            answer: [{ valueBoolean: false }],
          },
          {
            linkId: "note",
            text: "One sentence about this month.",
            answer: [{ valueString: "Afternoons were harder. Hair care took more rest." }],
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "QuestionnaireResponse",
        id: "qr-sep-1",
        status: "in-progress",
        authored: "2026-09-16",
        questionnaire: "Questionnaire/monthly-mg",
        item: [
          {
            linkId: "energy",
            text: "Energy today. 1 is very tired. 5 is usual energy.",
            answer: [{ valueInteger: 3 }],
          },
          {
            linkId: "afternoonCrash",
            text: "Do afternoons feel much harder than mornings?",
            answer: [{ valueBoolean: true }],
          },
          {
            linkId: "swallowingChange",
            text: "Any new trouble swallowing?",
          },
          {
            linkId: "breathingWorry",
            text: "Any new breathing worry?",
          },
          {
            linkId: "note",
            text: "One sentence about this month.",
          },
        ],
      },
    },
    {
      resource: {
        resourceType: "Task",
        id: "task-survey-sep",
        status: "in-progress",
        for: { reference: "Patient/pat-7f3a9c" },
        code: { text: "Finish September monthly survey" },
        description:
          "Three of five questions still need an answer. The study uses this survey with MG-ADL scores. It does not change your clinic plan by itself.",
        restriction: { period: { end: "2026-09-30" } },
      },
    },
    {
      resource: {
        resourceType: "Task",
        id: "task-survey-oct",
        status: "requested",
        for: { reference: "Patient/pat-7f3a9c" },
        code: { text: "October monthly survey" },
        description:
          "The next full survey window opens 2026-10-01. Use the study instructions you already have. No hospital portal is in this file.",
        restriction: { period: { start: "2026-10-01", end: "2026-10-15" } },
      },
    },
    {
      resource: {
        resourceType: "Task",
        id: "task-contact",
        status: "ready",
        for: { reference: "Patient/pat-7f3a9c" },
        code: { text: "Study team contact" },
        description:
          "If a question is hard or a due date is unclear, use the contact method in the study instructions. This file does not list a phone number.",
      },
    },
  ],
} as const;

export const codeBook: Record<string, string> = {
  "G70.00":
    "Myasthenia gravis without an acute flare code. A disease that makes muscles tire and weaken.",
  "R53.83": "Fatigue. A tired feeling that rest does not always fix.",
  "9068":
    "Pyridostigmine. A medicine that can help muscle strength for a short time.",
  "8640": "Prednisone. A steroid medicine that can lower immune activity.",
  "75859-8":
    "MG-ADL. A short score of how MG affects daily tasks. Higher is harder. Range is 0 to 24.",
  "20427-8":
    "AChR binding antibody. A blood test often high in people with MG. This file uses it as a study result.",
  "2157-6":
    "Creatine kinase. A blood test for muscle leak. A value in range does not rule MG in or out.",
  AMB: "Ambulatory visit. A clinic visit. The person is not admitted overnight.",
  H: "High. The value is above the local reference range in this file.",
  N: "Normal. The value is inside the local reference range in this file.",
};
