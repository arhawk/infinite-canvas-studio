# **\[Final Report\]**

**Abstract**

The abstract should be between 150-600 words. Briefly summarise your project/research. The abstract is usually written last, when you have a clear idea of your project as a whole. The aim of this section is to quickly introduce the reader to the project, and ideally engage their interest and encourage them to read the rest of the proposal. You should include an overview of the project, its motivation, the objectives, and the methods you have used, and discussions and findings. Do not include details in this section , you will have plenty of space in later sections. Also remember that the reader may not understand the technical details of your project so avoid jargon and leave in-depth discussion for later sections.

**用一段浓缩说明 Infinite Canvas Studio 是一个面向教学、展示和知识组织的无限画布原型，先交代传统线性幻灯片、分散资源和课堂互动工具割裂带来的问题，再概括本项目的目标是把页面、文字、图片、iframe、视频、JavaScript runner、ranking activity、连接、目录导航、演示模式、在线房间和本地导出整合到一个浏览器应用中。方法只写高层次，例如采用 Agile/iterative software development、vanilla JavaScript + Vite + Konva.js、组件/插件架构、Vitest 与 Playwright 测试，不展开代码细节。结果部分只总结已经完成的关键成果与价值，例如完成可运行原型、支持编辑/演示/分享/导出/测试闭环。最后一句回应评分标准中的 implications and consequences：说明该工具对教师备课、非线性展示、学生跟随或自由浏览、离线材料分发有什么实际意义，但不要在 Abstract 中重复 Results 或 Discussion 的详细论证。**

**任务分配**

[Contribution Statement (All)](#contribution-statement)

[Abstract (ZeruLi)](#abstract)

[Table of Contents](#table-of-contents)

[**1\.**	**Introduction (Yuchen)**](#introduction)

[**2\.**	**Related Literature (Qiuwen)**](#related-literature)

[2.1	Literature Review (Qiuwen)](#literature-review)

[**3\.**	**Project Problems (xiaoyancao)**](#project-problems)

[3.1	Project Aims & Objectives (xiaoyancao)](#project-aims-&-objectives)

[3.2	Project Questions (xiaoyancao)](#project-questions)

[3.3	Project Scope (xiaoyancao)](#project-scope)

[**4\.**	**Methodologies (BowenBai)**](#methodologies)

[4.1	Methods (BowenBai)](#methods)

[4.2	Data Collection (Jialu Shi)](#data-collection)

[4.3	Data Analysis (Jialu Shi)](#data-analysis)

[4.4	Deployment (Zehao)](#deployment)

[4.5	Testing (Zehao)](#testing)

[**5\.**	**Resources**](#resources)

[5.1	Hardware & Software (Zehao)](#hardware-&-software)

[5.2	Materials (Yuchen)](#materials)

[5.3	Roles & Responsibilities (All)](#roles-&-responsibilities)

[**6\.**	**Milestones / Schedule (ZeruLi)**](#milestones-/-schedule)

[**7\.**	**Results (BowenBai)**](#results)

[**8\.**	**Discussion (xuexinlin)**](#discussion)

[**9\.**	**Limitations and Future Works (yuchen)**](#limitations-and-future-works)

[**References (Jialu Shi)**](#references)

**AI use acknowledgement （BowenBai）**

| Note: The final report follows a similar structure to the proposal report, and reusing some content (e.g., literature review) is acceptable, but please revise the reused content to align with your final outcomes. Add any new materials that your group discovered during the project into the final report. Ensure that the overall similarity score of any report is no higher than 35%. |
| :---- |

# **1. Introduction** {#introduction}

In this section you will describe the context of your project. You will introduce the general background knowledge needed to understand the project topic (as it relates to your proposal), the motivation for your project, and the benefits that may be provided by addressing the project question. This should enable a clear and concise description of the problem that your proposal addresses. Write in a way that people or reader who does not have the same background will be able to follow or understand. No technical information is needed to be described in this section.

**本节只讲背景、动机、问题和 proposed solution，不写技术实现细节。第一段介绍教育/演示场景中常见的内容组织方式：PPT 适合线性讲解，但当教师需要同时展示网页、代码、视频、图片、活动任务和概念关系时，材料容易分散，学生也难以在整体结构和局部内容之间切换。第二段提出项目动机：构建一个 browser-based infinite canvas，让教学内容既能像白板一样自由组织，又能像演示工具一样按页面、按钮和连接进行导航。第三段用非技术语言概括 Infinite Canvas Studio 的解决方案和收益：编辑模式用于备课与构建内容，演示模式用于课堂展示，在线房间用于同步观看，本地 JSON/HTML 导出用于保存和分发。最后明确项目的 broader implication：它不是单纯做一个画布，而是探索如何把 visual organisation、interactive learning materials 和 presentation delivery 合并成一个 coherent IT artefact。**

# **2. Related Literature** {#related-literature}

Describe in detail the related knowledge needed to understand your work and how it relates to existing work. This may take the form of a literature review, or a review of related projects.

**本节作为文献综述的总引入，说明为什么需要研究相关工作：项目涉及无限画布交互、概念图/思维导图、非线性演示、协作或共享学习环境、课堂多媒体工具和软件可用性测试。这里不要逐篇罗列文献，而要先建立分类框架，让后面的 Literature Review 能围绕“现有工具解决了什么、仍缺什么、我们的项目如何回应这些缺口”展开。可简短提到将比较 Miro、FigJam、Canva/PowerPoint、Prezi、Notion/whiteboard 类工具以及教育技术研究中的 visual learning、multimedia learning、collaborative learning 等方向。**

## **2.1 Literature Review** {#literature-review}

A literature review is done by analysing and articulating the published sources and literature on the specific topic of the project.  In this section, you should emphasise the review is needed and why the selected topic is essential for the project. Moreover, the scope of the literature reviewed and the selection criteria, such as the type of sources, keyword and any particular date range, need to be specified.

The literature reviewed can be in the form of an article such as conference paper, journal paper, a research report or thesis. The literature review usually consists of three main components: an introduction, a body and a conclusion. Furthermore, the literature review is not only summaries one by one of the source. Instead, it constructs an essay that flows from one topic to another that relates to the project problem that is to be solved.

For this type of project, the expectation of the literature to support the argument is at least 10 – 15 citations that compile state of the art discussion related to the problem of the project.  Do not forget to consider the reliability of the sources.

**建议按主题组织几篇可靠来源，而不是按作者逐个摘要。第一组文献写 visual learning、concept maps 和 mind maps 如何帮助学习者建立知识结构，用来支撑“画布和连接关系”的必要性。第二组写 multimedia learning 与课堂互动工具，说明把图片、视频、网页、代码示例和活动组件放在同一空间的教育价值，同时指出认知负荷和界面复杂度风险。第三组写 infinite canvas、non-linear presentation 或 spatial hypertext 工具，比较它们在自由探索、演示路径和导航方面的优劣。第四组写 collaborative/remote classroom tools，连接到在线房间、Host/View camera mode 和只读 viewer 的设计。结尾必须提炼 gap：现有工具通常在自由白板、结构化演示、可嵌入教学材料、离线导出和轻量部署之间有所取舍；本项目的贡献是以一个前端原型整合这些能力。避免在本节详细描述我们实现的全部功能，功能细节留到 Methodologies 和 Results。**

# **3. Project Problems** {#project-problems}

Clearly state the problem or question the project intends to investigate. Describe the scope of your project since it may not be feasible to completely solve the problem. State the objectives and how completion will be measured.

**本节要把 Introduction 中的动机转成可评估的问题陈述。先用一段明确 client/user problem：教师和内容创作者在准备交互式课程或非线性展示时，需要在多个工具之间切换，导致材料管理、课堂导航、保存分发和学生观看体验不连贯。然后说明 project problem 不是“做一个所有人都能用的通用白板”，而是“设计并实现一个支持教学内容组织、演示导航、基础互动和导出的可运行无限画布原型”。最后说明完成度衡量方式：功能是否覆盖核心用户流程、文档是否可保存/恢复、演示与分享是否可运行、自动化测试是否验证关键路径。**

## **3.1 Project Aims & Objectives** {#project-aims-&-objectives}

In this section, the aims and objectives of the project associated with the project question or problem should be explained in detail.

**先写一个总 aim：开发一个面向教学和演示的 browser-based infinite canvas prototype。然后列出可测量 objectives：实现画布 pan/zoom 和坐标转换；实现 Page、Text、Sticky、Image、Iframe、Video、JavaScript Editor、Ranking Box、Button 等组件；实现 edit/presentation 模式和 outline/catalog 导航；实现 connections、button jumps、focus navigation 和 minimap；实现 local undo/redo、JSON save/load、single-file HTML export；实现 online room sharing with optional password、QR link、host/viewer camera modes；实现 unit/e2e testing baseline。每个 objective 后面可说明用什么结果证明完成，例如功能可演示、测试覆盖、文档可 roundtrip。**

## **3.2 Project Questions** {#project-questions}

In this section, an apparent problem or question faced by the client needs to be defined and stated. Sometimes, even though the client already stated their problem it might be only the symptoms.

**把问题写成 3-5 个 research/development questions，避免和 objectives 完全重复。可以包括：如何在一个网页应用中同时支持自由空间组织和结构化演示导航？如何让多媒体教学组件在 canvas-native 与 DOM overlay 之间保持一致的选择、保存和恢复行为？如何让教师编辑权限和学生只读观看体验共存？如何通过本地导出和在线房间降低部署与分发门槛？如何用自动化测试证明复杂画布交互的可靠性？每个问题都应能在 Results 或 Discussion 中被回应。**

## **3.3 Project Scope** {#project-scope}

In many cases, the problem might be too big to be solved.  The scope needs to be stated in this section to make it easier to justify the outcome or the completion of the project.

**清楚划分 in scope 和 out of scope。In scope 写前端原型、无限画布、组件系统、编辑/演示模式、本地保存导出、轻量在线分享、测试和产品文档。Out of scope 写不实现完整用户账号系统、数据库持久化、多用户实时协同编辑、复杂权限管理、移动端原生应用、云端文件存储或商业级部署运维。说明这个范围选择的理由：课程项目时间有限，重点是验证 IT artefact 和教学展示工作流，而不是构建完整 SaaS 平台。这个部分只定义边界，不提前讨论未来扩展，未来扩展留到 Limitations and Future Works。**

# **4. Methodologies** {#methodologies}

Depending on the nature of your project, the methodologies adopted will be different.

**IS projects**: In this section, the group/student should explain the methodology that will be used to solve the problem or problems at the core of the project.  The methodology section should explain and inform the reader as to how data was collected, how the IT artefact is developed and tested and so forth.  You should explain the reasons why you chose a particular technique and procedure for your project. By providing sufficient information in your report you will allow others to replicate your methodology. Moreover, the appropriate sample size also needs to be considered in order to ensure a statistically rigorous recommendations based on your findings.

**SW Development**: Describe the methods you will use to solve the problem you are addressing, such as the SDLC methodology adopted, for example Agile. Explain how data is collected, the techniques used to analyse data, the models chosen, and how accuracy of analysis was determined. You should explain the reasons why you chose a particular technique and procedure for your project. You should also include how you intend to deploy the system to your clients as well as the testing processes involved.

For software development project, include additonal sections where appropriate.

**Data Science project**s: Describe the methods you will use to solve the problem you are addressing. Explain how data is collected, the techniques used to analyse data, the models chosen, and how accuracy of analysis was determined. You should explain the reasons why you chose a particular technique and procedure for your project.

**本节按照 software development project 来写，重点回应评分标准中的 selected methodologies、resources、milestones and expected outcomes。开头说明采用 iterative/agile development：从需求与竞品分析开始，逐步实现核心画布、组件、保存恢复、演示导航、在线分享、测试和文档；每轮根据功能风险和用户流程优先级调整。然后说明为什么选择轻量前端架构：Vite + vanilla JavaScript + Konva.js 适合快速开发 canvas prototype，class-based App/Plugin/Component architecture 让功能模块可扩展，Vitest/Playwright 让核心逻辑和交互可验证。避免在这里重复 Results 的成果清单；这里写“怎么做、为什么这样做、如何保证可复现”。**

## **4.1 Methods** {#methods}

Describe the methods you will use to solve the problem you are addressing.

**按开发流程写，不要只列技术名。可分为需求分析、架构设计、组件开发、交互开发、文档/导出设计、在线分享设计和验证迭代。需求分析说明目标用户是教师、学生、presenters 和内容创作者；架构设计说明采用 App、ModeManager、StageController、BasePlugin、BaseComponent、registry 和 event bus，把“组件内容”和“插件行为”分离；开发方法说明先实现核心 canvas 和 component palette，再扩展 selection/history/document/focus/room share 等插件；质量方法说明每个新组件必须支持 create/serialize/applySerializedData，保证 undo/redo 和 save/load roundtrip。**

## **4.2 Data Collection** {#data-collection}

Explain how data is collected.

## **4.3 Data Analysis** {#data-analysis}

Explain the techniques used to analyse data

## **4.4 Deployment** {#deployment}

Explain the deployment of the system on client’s infrastructure. Remember to mention how updates and bug fixes will be distributed after the deployment. Attention please: some of our projects may not involve deployment process. If that is the case, your group is allowed to provide brief reason on why deployment process is not necessary in your project as the content for this subsection.

**说明部署策略分为前端静态应用、房间 relay server 和离线导出三层。前端通过 Vite build 生成 dist，可部署到静态 Web hosting；room sharing 需要 Node.js HTTP/WebSocket relay server，当前设计是 stateless/in-memory room relay，适合课程演示和轻量分享；single-file HTML export 让用户可以不依赖服务器分发作品。更新和 bug fix 写成通过版本控制、重新 build、替换静态文件和重启 relay server 分发；同时说明本项目没有实现生产级数据库、账号和长期房间存储，因此部署目标是 prototype demonstration 而非 enterprise production。**

## **4.5 Testing** {#testing}

Include the detailed description of your testing process and methodologies. Examples include: Test Driven Development (TDD), Unit Testing, Integration Testing, vigorous testing, etc. Remember to explain why the methodology was chosen and how the defined testing process will contribute to the quality software development in your specific project. Attention please: some of our projects may not involve testing process. If that is the case, your group is allowed to provide brief reason on why testing process is not necessary in your project as the content for this subsection.

**把测试写成项目质量保证的核心证据。先说明 unit tests 使用 Vitest/jsdom，覆盖 EventBus、registries、ModeManager、document schema/serializer、catalog、room route/server store、component behavior 等纯逻辑。再说明 E2E 使用 Playwright，覆盖 boot、mode toggle、palette add/delete、undo/redo、drawing/eraser、connections、focus navigation、component editor、document roundtrip、room sharing 和 unauthorized message handling。解释为什么需要两层测试：canvas 交互复杂且容易回归，unit tests 验证可分离逻辑，Playwright 验证真实用户流程。最后提到 testApi 用于减少脆弱 pixel math，使测试更稳定。不要把测试结果解释成项目意义，意义留到 Discussion。**

# **5. Resources** {#resources}

Indicate the resources that will be required to complete your projects. Depending on the nature of the project, include sections where appropriate.

## **5.1 Hardware & Software** {#hardware-&-software}

**SW Projects**: List the hardware that the proposed software will be compatible with and which it will be able to run on. For example: “The software will run on 32bit and 64bit Windows desktop systems from Windows XP to Windows 10.” or “The software will run on Java which can be implemented in a virtual environment on all major operating systems (Windows, Mac and Linux) on all modern hardware architectures (iPhones and Android smartphones).” List all software technologies that will be used in the development of the proposed software as well as all software that will be integrated with the system, for each one explain why it was chosen.

**IS/Data Science Projects**: List the software tools that will be used in the project.

**硬件写普通开发电脑即可，例如 macOS/Windows/Linux laptop 和现代浏览器。软件列出并解释：Node.js/pnpm 用于依赖和脚本管理；Vite 用于本地开发和 build；vanilla JavaScript 作为主要语言；Konva.js 用于 canvas scene graph、selection 和 transform；Lucide Icons 用于一致的工具图标；Vitest/jsdom 用于 unit tests；Playwright/Chromium 用于 E2E；Node.js WebSocket server 用于 room relay；Git/GitHub 用于版本控制；Markdown/HTML documentation 用于报告和用户文档。每个工具用一句话解释选择理由。**

## **5.2 Materials** {#materials}

**SW/IS/Data Science projects**: List other resources you will need to complete your project

**Materials 不要再写硬件软件，而写支持开发和报告的资料：course assignment brief、Group Final Report Criteria、proposal/progress feedback、literature sources、competitor screenshots or notes、user scenarios、meeting minutes、testing reports、README/AGENTS/project documentation、manual QA notes、sample boards or demo content。说明这些材料分别用于需求定义、文献支撑、设计验证、结果展示和 final report 写作。注意如果引用外部图片、论文或产品资料，需要在 References 中按 APA 格式列出。**

## **5.3 Roles & Responsibilities** {#roles-&-responsibilities}

In this section, the **semester-long** detailed responsibilities of each team member should be summarised, such as “For the whole semester, who took what role(s) with detailed responsibilities as…”. Each member can have more than one role, depending on the nature of the project. 

# **6. Milestones / Schedule** {#milestones-/-schedule}

List the actual milestones. There should be sufficient detail to be able to measure progress and completion. Describe the actual timeline for the work your group has done. A Gantt chart is ideal for illustrating the timeline and where the milestones fit in.

You can use the sample example format below of a project timeline or create your own Gantt chart to detail the breakdown of tasks.

| Milestone | Tasks | Reporting | Date |
| :---- | :---- | :---- | :---- |
| Week-1 | Analysis and design stage, gather data and create system mockup | Client meeting to review the project | 11-03-2018 |
| Week-2 | Architecture design | Client meeting to review the work plan | …… |
| Week-3 | Design work plan | None |  |
| Week-4 | Create database | None |  |
| Week-5 | Proposal Report Due |  |  |
| Week-6 | Create GUI | Client meeting to review GUI |  |
| Week-7 | Integration with iPhone environment | None |  |
| Week-8 | Testing | None |  |
| Week-9 | Progress Report Due |  |  |
| Week-10 | Deployment | Client meeting to deploy the system |  |
| Week-11 | Documentation |  |  |
| Week-12 | Final Presentation |  |  |
| Week-13 | Final Report (thesis) |  |  |


# **7. Results** {#results}

**DS projects**: Results/Outcomes of your project. This should be a factual description of the experimental results or data analysis, illustrated with relevant figures. Include any information needed to interpret your results. Describe any challeges that affected the results. Interpreting the results can be left for the discussion section.

**IS/SW development projects**: If your project is developing a prototype as a tool to solve the problem, then describe the nature of the prototype system that your team is building. Describe how the IT artefact (prototype) was developed and how it was demonstrated to the client. Explain the method(s) of design, development, testing, evaluation and analysis that was employed to show that your propose prototype is what the client expected.

If your project uses an available IT tool, then you should describe and report why that tool has been selected and the nature of data that your team is collected. Explain how the team collected this data. Also, you should report the purpose of collecting this data. Finally, report the method(s) of data analysis that were employed to analyse the collected data to interpret the findings.The project deliverables should be stated and described in this section. Discuss the implications of completing your project. The implications could affect the client (e.g. in term of business process, decision making and so forth), the domain of knowledge or general audience.

**本节写 factual outcomes，少解释意义，重点回答 Project Questions。建议按 deliverables 组织：1）可运行的 Infinite Canvas Studio prototype，包含 pan/zoom、component palette、selection、drawing、shapes、connections；2）教学/演示工作流，包含 Page、outline/catalog、branch collapse、focus navigation、button/connection jumps、presentation mode、page compare、minimap；3）内容持久化与分发，包含 local undo/redo、JSON save/load、single-file HTML export、self-contained image/video data；4）online room sharing，包含 optional password、QR/share link、host/viewer camera mode、viewer permission gating；5）quality evidence，包含 unit tests、Playwright E2E tests、smoke/build checks 和 product documentation。每项结果写“实现了什么、如何演示或验证、对应哪个 objective/question”，不要把同一功能反复列在多个段落。可插入截图、测试结果表或功能矩阵。**

# **8. Discussion** {#discussion}

In this section, discuss the results, implications and significance of your project contributions. The implication should be explained in more detail in the final report than your initial proposal. This section is also where you state how your findings contribute to existing gaps in the field or recommendations – practical suggestions to implementation of findings/outcomes.

**本节不要重新列 Results，而要解释结果为什么重要。第一段回应 literature gap：Infinite Canvas Studio 通过无限画布 + 结构化 outline/presentation navigation，在自由探索和可控演示之间取得平衡。第二段讨论对教师/学生/内容创作者的 implication：教师可以在同一空间组织资源并演示，学生可在 Host view 跟随或 Viewer view 自主浏览，本地导出降低课堂材料分发门槛。第三段讨论技术/软件工程意义：组件负责内容、插件负责行为、事件驱动 history 和 document state separation 提升可维护性与可扩展性。第四段讨论 trade-offs：轻量前端和 stateless relay 适合 prototype，但也限制了长期协作和生产部署。最后给 practical recommendations，例如后续实现真实用户评估、权限/持久化、性能优化前，应保持现有测试和 serialization contract。**

# **9. Limitations and Future Works** {#limitations-and-future-works}

Describe the limitations of your project and make suggestions for future works. For example of project limitations can be the number or quality of data, participants, time constraint, platform constraints and so forth. Future work can be extensions that go beyond the limitations of your project, or be based on the wider implications of your project.

**本节必须把每个 limitation 连接到 project-specific attribute，并给出对应 future work。可写限制：用户评估样本有限，目前主要依赖团队测试和 automated tests，未来需要教师/学生 usability study；room server 是 in-memory/stateless，没有账号、数据库和长期房间，未来可加入 authentication、persistent storage 和 collaboration history；导入目前偏 full-board replace，未来可做 partial import/merge 和 rollback-atomic restore；DOM overlay components 受浏览器安全策略影响，例如 iframe/video/local file 权限，未来可增强错误提示和兼容策略；移动端和 accessibility 尚未作为主要目标，未来可做 responsive/mobile interaction 和 keyboard/screen-reader support；大型画布性能与冲突协作还需优化。不要把“还没写报告”或“时间不够”作为唯一限制，要说明这些限制如何影响项目结果和下一步优先级。**

**References**

American Psychological Association (APA). (2010). *Publication Manual of the American Psychological Association* (6th Ed.). Washington, DC: Author.

* You are strongly encouraged to use information from reputable websites such as Wall Street Journal, New York Times, and websites from Governments, as well as books, academic journals and magazines (e.g., The Economist). Some well-regarded journals you may refer to are: Harvard Business Review, Information Systems Research, Management Science and MIS Quarterly.   
* Please cite all references at the end of your paper (both proposal and final report). You should include references to facts, figures and any other information that you obtained from various sources. References from relevant papers in the University Digital Library are preferred over Internet sources as Internet sources may not always be reliable.  
* Whenever you quote, paraphrase, summarise or refer to ideas, facts, figures or findings from another source (e.g. research paper, book, website), you should cite the source, with appropriate formatting, in the sentence that mentions these ideas or figures. It is not sufficient to just provide a list of references at the end of your paper. The source that you use should be cited in the text of your paper, either in parentheses or as part of the text itself. We suggest the use of APA style for referencing.  If the references quite a lot, you can use the reference management system such as Endnote that provided by the University of Sydney ([http://libguides.library.usyd.edu.au/endnote)](http://libguides.library.usyd.edu.au/endnote\)).  
* You are reminded that the University takes plagiarism infringements seriously. If the sources are not cited correctly, it may be deemed as plagiarism. Please note that your submission will be forwarded to an automated plagiarism checking system.

**AI use acknowledgement**

Group Final Report
Criteria	Ratings	Points
Topic Definition
view longer description

Full Marks
Provides an insightful knowledge of information technology by discussing the implications and consequences of proposed project works in Abstract and Introduction. Able to discuss and summarise project by articulating the general background, motivation, benefits, problems and proposed solution.
8 to >7 pts

Very Good
Provides a broad knowledge of information technology by describing the proposed project works. Explain and link implications and consequences to project motivation, benefits, problems and proposed solution.
7 to >6 pts

Good
Provides the summary of project and states the general background, purpose, motivation, problem and proposed solution. Attempt to explain and link implications and consequences.
6 to >4 pts

Satisfactory
Identifies the general background, purpose, motivation, problem and proposed solution. Attempt to explain and link to implications and consequences, some of which are incorrect.
4 to >2 pts

Poor
Attempt to identify the general background, purpose, motivation, problem and solution. Attempt to explain and link to implications and consequences, most of which are incorrect.
2 to >0 pts

No Marks
No Attempt
0 pts
/8 pts
Project Background
view longer description

Full Marks
Provides an insightful explanation of project background by discussing findings from related literature/ literature review that are significant to the project, both theoretically and practically. Clearly demonstrates understanding of project proposal by identifying, discussing and linking it to project problems, aims and objectives, questions and scope.
12 to >10 pts

Very Good
Provides a broad explanation of project background by identifying and discussing findings that are significant to project proposal. Identifies and discusses project problems, aims and objectives, questions and scope.
10 to >9 pts

Good
Provides brief explanation of project background, limited by findings in related literature/ literature review. Identifies project problems, aims and objectives, questions and scope.
9 to >7 pts

Satisfactory
States project background, problems, aims and objectives, questions and scope explicitly and unambiguously.
7 to >4 pts

Poor
Provides explanation with insufficient information that leaves reader confused.
4 to >0 pts

No Marks
No attempt
0 pts
/12 pts
Project Plan
view longer description

Full Marks
Provides insightful and detailed information of project plan by discussing the implications and consequences in relation to selected methodologies. Identify and discuss resources required for project plan aligned with methodologies identified. Demonstrate critical knowledge of project planning by discussing and identifying project milestones/schedule and expected outcomes. Exhibit exceptional level of complexity and intricacy of project deliverables.
10 to >8 pts

Very Good
Provides a broad explanation of project plan by identifying and discussing selected methodologies. Identifies and discusses resources, milestones and expected outcomes. Exhibit high level of complexity and intricacy of project deliverables.
8 to >6 pts

Good
Provides brief explanation of project plan by identifying selected methodologies, resources, milestones and outcomes. Exhibit moderate level of complexity and intricacy of project deliverables.
6 to >4 pts

Satisfactory
States project plan explicitly and unambiguously. Identifies methodologies, resources, milestones and outcomes, some of which are incorrect. Exhibit low level of complexity and intricacy of project deliverables.
4 to >2 pts

Poor
Provides insufficient information regarding project plan. Attempt to identify methodologies, resources, milestones and outcomes, most of which are incorrect.
2 to >0 pts

No Marks
No attempt
0 pts
/10 pts
Results
view longer description

Full Marks
Provides insightful knowledge of project results by identifying and discussing project outcomes. Demonstrate critical knowledge by interpreting results or project outcomes to answer project problems, issues or questions raised.
20 to >18 pts

Very Good
Provides broad knowledge of project results by identifying and discussion project outcomes. Identifies links with project problems, issues or questions raised.
18 to >15 pts

Good
Provides brief knowledge of project results by identifying project outcomes. Attempts to link to project problems issues or questions raised.
15 to >12 pts

Satisfactory
States project results explicitly and unambiguously, where some of it are incorrect.
12 to >7 pts

Poor
Provides insufficient information to understand results of project outcomes.
7 to >0 pts

No Marks
No attempt
0 pts
/20 pts
Discussion
view longer description

Full Marks
Provides insightful knowledge of project outcomes by identifying and discussing the implications and significance of project results. Demonstrate critical knowledge by discussing how results findings contribute to solve project issues, aims, gaps, etc.
20 to >18 pts

Very Good
Provides broad knowledge of project outcomes by identifying and discussing implications and significances of results. Links findings with project solutions, issues, aims, gaps, etc.
18 to >15 pts

Good
Provides brief knowledge of project outcomes by identifying implications and significances of results. Attempts to link findings with project solutions, issues, aims, gaps, etc.
15 to >12 pts

Satisfactory
States implications and significances explicitly and unambiguously.
12 to >7 pts

Poor
Provides insufficient information to how outcomes has any implication and significance to project solutions, aims, gaps, etc. Leave reader confused.
7 to >0 pts

No Marks
No attempt
0 pts
/20 pts
Limitations and Future Works
view longer description

Full Marks
Provides insightful knowledge of project by identifying and discussing the limitations and suggestions for future works. Demonstrate critical knowledge by linking limitations and future works to project specific attributes.
20 to >18 pts

Very Good
Provides broad knowledge of project by identifying and discussing limitations and suggestions for future works. Links them to project specific attributes.
18 to >15 pts

Good
Provides brief knowledge of project by identifying limitations and suggestions for future works. Attempts to link to project specific attributes.
15 to >12 pts

Satisfactory
States limitations and future works explicitly and unambiguously. Some of it are incorrect.
12 to >7 pts

Poor
Provide insufficient information to describe limitations and future works. Most of it are incorrect.
7 to >0 pts

No Marks
No attempt
0 pts
/20 pts
Reflective Practice
view longer description

Full Marks
Clearly demonstrates insightful understanding of achievements in the report. Explicitly acknowledges the use or not use of AI. Adopts a tone in writing that is appropriate to the report’s intended viewership. Delivers well-defined structure of the report, neat and professionally presented, well-formatted bibliography with no spelling, grammar or punctuation errors.
10 to >8 pts

Very Good
Clearly demonstrates insightful understanding of achievements in the report. Explicitly acknowledges the use or not use of AI. Ensures that each section of the report is clear and links backwards and forwards to other related sections.
8 to >6 pts

Good
Demonstrates good understanding of achievements in the report. Explicitly acknowledges the use or not use of AI. Provides headings and subheadings that show development of discussion. Write sentences where meaning is immediately clear to the reader.
6 to >4 pts

Satisfactory
Demonstrates basic understanding of achievements in the report. Basic acknowledgment of AI use. Provides a title page, contents page and summary. Provides correctly referenced citations in-text and in reference list. Includes illustrations that relate to content of report.
4 to >2 pts

Poor
Limited or superficial understanding of achievements. Minimal or unclear acknowledgment of AI use. Provides report that does not consistently flow with requirements for this assignment. No evidence of care taken to edit work. Headings and subheadings do not show report structure.
2 to >0 pts

No Marks
No attempt
0 pts
/10 pts
