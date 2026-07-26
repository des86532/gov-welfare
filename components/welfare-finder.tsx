"use client";

import { useState } from "react";
import Link from "next/link";
import { factDefinitions, factDefinitionByKey } from "@/data/facts";
import { programs } from "@/data/programs";
import type { FactDefinition, FactValue, ProfileFacts, Program } from "@/lib/domain";
import { MATCH_STATUS_LABELS, collectRuleFields, matchProgram, type MatchStatus } from "@/lib/rules";

const coreDefinitions = factDefinitions.filter((definition) => definition.core);
const ranking: Record<MatchStatus, number> = {
  eligible: 0,
  review_required: 1,
  possible: 2,
  descriptive: 3,
  needs_review: 4,
  closed: 5,
  ineligible: 6,
};

function coerceValue(definition: FactDefinition, raw: string): FactValue {
  if (raw === "" || raw === "prefer_not") return undefined;
  if (definition.type === "boolean") return raw === "true";
  if (definition.type === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  }
  return raw;
}

function Question({ definition, value, onChange }: {
  definition: FactDefinition;
  value: FactValue;
  onChange: (value: FactValue) => void;
}) {
  const id = `fact-${definition.key}`;
  if (definition.type === "date" || definition.type === "number") {
    return (
      <label className="question" htmlFor={id}>
        <span>{definition.label} <small>可略過</small></span>
        <input
          id={id}
          type={definition.type}
          value={typeof value === "string" || typeof value === "number" ? value : ""}
          min={definition.type === "number" ? 0 : undefined}
          onChange={(event) => onChange(coerceValue(definition, event.target.value))}
        />
        {definition.help ? <small className="field-help">{definition.help}</small> : null}
      </label>
    );
  }
  return (
    <label className="question" htmlFor={id}>
      <span>{definition.label} <small>可略過</small></span>
      <select id={id} value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(coerceValue(definition, event.target.value))}>
        <option value="">不知道／暫不提供</option>
        {definition.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {definition.help ? <small className="field-help">{definition.help}</small> : null}
    </label>
  );
}

function ResultCard({ program, status, facts }: { program: Program; status: MatchStatus; facts: ProfileFacts }) {
  const evaluation = matchProgram(program, facts).evaluation;
  const visibleReasons = evaluation.reasons.filter((reason) => status === "ineligible" ? reason.truth === false : reason.truth !== false);
  return (
    <article className={`result-card result-${status}`}>
      <div className="result-heading">
        <span className="result-status">{MATCH_STATUS_LABELS[status]}</span>
        <span>{program.jurisdiction}</span>
      </div>
      <h3><Link href={`/programs/${program.slug}`}>{program.title}</Link></h3>
      <p className="result-benefit">{program.benefitSummary}</p>
      {visibleReasons.length > 0 ? (
        <ul className="reason-list">
          {visibleReasons.slice(0, 4).map((reason, index) => (
            <li key={`${reason.field}-${index}`} data-truth={reason.truth}>
              <span aria-hidden="true">{reason.truth === true ? "✓" : reason.truth === false ? "×" : "?"}</span>
              {reason.label}
            </li>
          ))}
        </ul>
      ) : <p className="muted">本方案尚未完成可自動判斷的 Rules，請查看官方說明。</p>}
      <div className="result-actions">
        <Link className="button button-small button-ghost" href={`/programs/${program.slug}`}>查看資格依據</Link>
        <a className="text-link" href={program.applicationUrl ?? program.officialUrl} target="_blank" rel="noreferrer">前往官方網站 ↗</a>
      </div>
    </article>
  );
}

export function WelfareFinder() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [facts, setFacts] = useState<ProfileFacts>({});

  const coreCandidatePrograms = programs.filter((program) => {
    const status = matchProgram(program, facts).status;
    return status !== "ineligible" && status !== "closed";
  });
  const followupKeys = [...new Set(coreCandidatePrograms.flatMap((program) => collectRuleFields(program.rule)))]
    .filter((key) => key !== "age" && !coreDefinitions.some((definition) => definition.key === key));
  const followupDefinitions = followupKeys
    .map((key) => factDefinitionByKey.get(key))
    .filter((definition): definition is FactDefinition => Boolean(definition));
  const matches = programs
    .map((program) => matchProgram(program, facts))
    .sort((a, b) => ranking[a.status] - ranking[b.status] || a.program.title.localeCompare(b.program.title, "zh-Hant"));
  const promising = matches.filter((match) => ["eligible", "review_required", "possible"].includes(match.status));
  const descriptive = matches.filter((match) => ["descriptive", "needs_review", "closed"].includes(match.status));
  const ineligible = matches.filter((match) => match.status === "ineligible");

  function updateFact(key: string, value: FactValue) {
    setFacts((current) => {
      const next = { ...current };
      if (value === undefined || value === null || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function reset() {
    setFacts({});
    setStep(1);
  }

  return (
    <section className="finder-shell">
      <div className="finder-progress" aria-label={`目前步驟 ${step}，共 3 步`}>
        {["基本資料", "補充條件", "比對結果"].map((label, index) => (
          <div key={label} className={step >= index + 1 ? "active" : ""}>
            <span>{index + 1}</span><small>{label}</small>
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="finder-panel">
          <div className="panel-intro">
            <span className="section-number">01</span>
            <div><p className="eyebrow">先縮小範圍</p><h2>告訴我們基本條件</h2><p>每一題都可以略過；資訊不足會顯示「可能符合」，不會擅自判定不符合。</p></div>
          </div>
          <div className="privacy-note"><strong>不留資料</strong><span>回答只存在目前 Browser memory，不送到 Server、不寫入 Database。</span></div>
          <div className="question-grid">
            {coreDefinitions.map((definition) => <Question key={definition.key} definition={definition} value={facts[definition.key]} onChange={(value) => updateFact(definition.key, value)} />)}
          </div>
          <div className="panel-actions"><span>{Object.keys(facts).length} 項已填</span><button className="button" type="button" onClick={() => setStep(2)}>繼續補充條件 <span aria-hidden="true">→</span></button></div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="finder-panel">
          <div className="panel-intro">
            <span className="section-number">02</span>
            <div><p className="eyebrow">Dynamic questionnaire</p><h2>只問候選方案需要的事</h2><p>目前保留 {coreCandidatePrograms.length} 個候選方案。以下 {followupDefinitions.length} 題由它們的 Rules 動態產生。</p></div>
          </div>
          <div className="question-grid followup-grid">
            {followupDefinitions.map((definition) => <Question key={definition.key} definition={definition} value={facts[definition.key]} onChange={(value) => updateFact(definition.key, value)} />)}
          </div>
          <div className="panel-actions">
            <button className="text-button" type="button" onClick={() => setStep(1)}>← 回上一步</button>
            <button className="button" type="button" onClick={() => setStep(3)}>查看 {programs.length} 個方案的結果 <span aria-hidden="true">→</span></button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="results-panel" aria-live="polite">
          <div className="results-summary">
            <div><p className="eyebrow">你的初篩結果</p><h2>{promising.length} 個方案值得先看</h2><p>這是資格初篩，不是政府核定。每張卡片都能查看 Rule 與官方 Source。</p></div>
            <div className="score-stamp"><strong>{promising.length}</strong><span>優先查看</span></div>
          </div>
          <div className="result-list">
            {promising.map((match) => <ResultCard key={match.program.id} program={match.program} status={match.status} facts={facts} />)}
          </div>
          {descriptive.length > 0 ? (
            <section className="secondary-results"><h2>其他可能方案</h2><p>官方有此方案，但 Rules 尚未完成 Review，或本期已截止。</p><div className="result-list compact">{descriptive.map((match) => <ResultCard key={match.program.id} program={match.program} status={match.status} facts={facts} />)}</div></section>
          ) : null}
          {ineligible.length > 0 ? (
            <details className="excluded-results"><summary>查看 {ineligible.length} 個目前有條件不符的方案</summary><div className="result-list compact">{ineligible.map((match) => <ResultCard key={match.program.id} program={match.program} status={match.status} facts={facts} />)}</div></details>
          ) : null}
          <div className="panel-actions"><button className="text-button" type="button" onClick={() => setStep(2)}>← 修改條件</button><button className="button button-ghost" type="button" onClick={reset}>清除並重新開始</button></div>
        </div>
      ) : null}
    </section>
  );
}
