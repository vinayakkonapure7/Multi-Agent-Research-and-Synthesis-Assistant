// Mock data — backend ban-ne tak isse UI chalega.
// Backend ready hone par api.js me USE_MOCK = false kar dena.

export const MOCK_FINDINGS = {
  sources_count: 14,
  key_points: 9,
  flagged: 2,
  findings: [
    {
      id: 'f1',
      text: 'RAG reduces hallucination rates by grounding LLM responses in retrieved context.',
      status: 'verified',
      sources: ['survey_2024.pdf', 'web: arxiv', 'web: blog'],
    },
    {
      id: 'f2',
      text: 'Retrieval quality directly affects final answer accuracy more than model size alone.',
      status: 'verified',
      sources: ['survey_2024.pdf', 'web: paper'],
    },
    {
      id: 'f3',
      text: 'Exact accuracy gains vary widely; one source reports figures others do not support.',
      status: 'flagged',
      reason: 'Conflicting evidence across sources',
      sources: ['web: blog'],
    },
    {
      id: 'f4',
      text: 'Citation grounding improves user trust in generated research reports.',
      status: 'verified',
      sources: ['survey_2024.pdf'],
    },
    {
      id: 'f5',
      text: 'Some claimed benchmark numbers could not be traced to a primary source.',
      status: 'flagged',
      reason: 'Source not verifiable',
      sources: ['web: forum'],
    },
  ],
}

export const MOCK_REPORT = {
  title: 'Impact of RAG on Factual Accuracy in LLMs',
  generated_at: 'Demo report',
  sections: [
    {
      heading: 'Executive Summary',
      body: 'Retrieval-Augmented Generation (RAG) improves the factual accuracy of large language models by grounding their output in retrieved source material. Across the reviewed sources, RAG consistently reduces hallucinations, though the exact magnitude of accuracy gains varies.',
    },
    {
      heading: 'Key Findings',
      body: 'Retrieval quality is a stronger driver of accuracy than model size alone. Citation grounding also increases user trust in the generated reports. Two claims were flagged during validation due to conflicting or unverifiable evidence.',
    },
    {
      heading: 'Conclusion',
      body: 'RAG is an effective technique for factual research tasks, but results depend heavily on retrieval quality and source reliability. Human review remains valuable for flagged claims.',
    },
  ],
}
