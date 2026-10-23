export const ANALYSIS_STAGES=[['descriptive','What happened?'],['diagnostic','What needs attention?'],['predictive','What may happen next?'],['prescriptive','What should we do?']] as const;
export type AnalysisStage=typeof ANALYSIS_STAGES[number][0];
export const DECISION_LEVELS=['Operational','Managerial','Tactical','Strategic'] as const;
export type ReportInsight={id:string;stage:AnalysisStage;label:string;values:Record<string,string|number|boolean|null>};
export type ReportInsights={year:number;barangayId:number;generatedAt:string;syntheticRecords:number;blocks:ReportInsight[]};
