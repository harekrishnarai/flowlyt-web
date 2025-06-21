export interface AnalysisConfig {
  strictMode: boolean;
  ignoreInfoLevel: boolean;
  focusOnSecurity: boolean;
  skipDocumentationChecks: boolean;
  customRules: {
    requireJobNames: boolean;
    requireStepNames: boolean;
    requireErrorHandling: boolean;
    requireCaching: boolean;
  };
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  strictMode: false,
  ignoreInfoLevel: false,
  focusOnSecurity: false,
  skipDocumentationChecks: false,
  customRules: {
    requireJobNames: true,
    requireStepNames: false,
    requireErrorHandling: false,
    requireCaching: true,
  }
};

export const STRICT_CONFIG: AnalysisConfig = {
  strictMode: true,
  ignoreInfoLevel: false,
  focusOnSecurity: false,
  skipDocumentationChecks: false,
  customRules: {
    requireJobNames: true,
    requireStepNames: true,
    requireErrorHandling: true,
    requireCaching: true,
  }
};

export const SECURITY_FOCUSED_CONFIG: AnalysisConfig = {
  strictMode: false,
  ignoreInfoLevel: true,
  focusOnSecurity: true,
  skipDocumentationChecks: true,
  customRules: {
    requireJobNames: false,
    requireStepNames: false,
    requireErrorHandling: true,
    requireCaching: false,
  }
};
