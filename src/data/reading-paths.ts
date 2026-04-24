export interface ReadingPathDefinition {
  id: string;
  title: string;
  description: string;
  featured?: boolean;
  slugs: readonly string[];
}

export const READING_PATHS = [
  {
    id: "phd-reality",
    title: "박사과정의 시작과 현실",
    description: "박사를 막 시작했거나 시작을 고민할 때, 생활과 감정의 실제를 먼저 잡아주는 흐름.",
    featured: true,
    slugs: [
      "pre-phd-me-wouldnt-believe",
      "undergrad-sayings-vs-reality",
      "first-advisor-advice",
      "family-not-understanding",
      "thinking-about-quitting",
      "finishing-thesis-chapter",
    ],
  },
  {
    id: "papers-and-writing",
    title: "논문을 읽고 쓰고 고치는 흐름",
    description: "초안, 구조, 리뷰 대응, 출판 이후의 실수까지 논문 한 편을 둘러싼 실제 작업 흐름.",
    featured: true,
    slugs: [
      "paper-writing-tips",
      "writing-stuck-points",
      "first-rebuttal-letter",
      "conference-vs-journal",
      "typo-in-published-paper",
    ],
  },
  {
    id: "experiments-and-reproducibility",
    title: "실험, 오류, 재현성",
    description: "장치를 만들고, 데이터 오류를 찾고, 남의 코드를 재현해보며 배우는 연구의 실무.",
    featured: true,
    slugs: [
      "first-experimental-setup",
      "dataset-error-discovery",
      "failed-reproduction",
      "successful-reproduction",
      "beating-baseline",
    ],
  },
  {
    id: "talks-and-community",
    title: "발표, 학회, 연구 공동체",
    description: "발표를 준비하고, 학회에 내고, 다른 사람의 연구를 함께 읽으며 커지는 감각.",
    slugs: [
      "reading-group-experience",
      "first-english-presentation",
      "week-before-abstract-deadline",
      "introducing-guest-speaker",
      "other-field-defense",
      "getting-field-jokes",
    ],
  },
  {
    id: "tools-and-routines",
    title: "도구와 작업 습관",
    description: "메모, PDF, 작은 기능, 배속 시청, 시간 관리처럼 연구 바깥을 지탱하는 습관.",
    slugs: [
      "note-taking-app-journey",
      "pdf-annotations",
      "accidental-feature",
      "youtube-lecture-15x",
      "just-five-more-minutes",
      "saying-no-to-projects",
    ],
  },
  {
    id: "researcher-mindset",
    title: "연구자의 사고와 태도",
    description: "깊이와 넓이, 유레카의 환상, 생각의 변화, 모른다고 말하는 법 같은 내면의 문제.",
    slugs: [
      "depth-vs-breadth",
      "eureka-moment-truth",
      "changing-mind",
      "finally-understanding",
      "saying-i-dont-know",
      "finally-understanding-rejection",
      "researchers-i-admire",
      "new-year-research-resolutions",
    ],
  },
  {
    id: "reading-papers",
    title: "논문을 읽는 감각",
    description: "찾고, 다시 읽고, 종이로 남기고, 다른 사람의 글을 읽으며 생기는 읽기의 감각.",
    slugs: [
      "finding-perfect-paper",
      "reading-twice",
      "printed-paper",
      "reading-advisor-thesis",
      "greek-letters-in-papers",
      "helping-friend-thesis",
    ],
  },
  {
    id: "research-beyond-lab",
    title: "연구실 밖과 연결되는 순간",
    description: "외부 협업, 산업체 미팅, 연구비, 뉴스, 이중 언어 감각처럼 연구 밖과 맞닿는 지점.",
    slugs: [
      "first-external-collaboration",
      "industry-meeting",
      "types-of-research-funding",
      "if-my-research-hit-news",
      "bilingual-research",
      "reading-science-news",
    ],
  },
] as const satisfies readonly ReadingPathDefinition[];
