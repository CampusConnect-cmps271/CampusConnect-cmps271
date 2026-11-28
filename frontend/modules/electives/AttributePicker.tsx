"use client";
import { useId, useState } from "react";
import styles from "./electives.module.css";

export function AttributePicker({ options, selected, onChange, disabled = false }: {
  options: string[]; selected: string[]; onChange: (values: string[]) => void; disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const choices = [...new Set([...selected, ...options])].filter(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <fieldset disabled={disabled} className={styles.attributePicker}>
    <legend>Course attributes</legend>
    <p id={`${id}-hint`}>Choose up to 10. Courses can match any selected attribute—for example, Social Sciences I or Social Sciences II.</p>
    <label htmlFor={id}>Search attributes</label>
    <input id={id} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try social sciences" aria-describedby={`${id}-hint`} />
    {selected.length > 0 && <div className={styles.selectedAttributes} aria-label="Selected attributes">
      {selected.map(name => <button key={name} type="button" aria-label={`Remove ${name}`} onClick={() => onChange(selected.filter(value => value !== name))}>{name} <span aria-hidden="true">×</span></button>)}
      <button type="button" onClick={() => onChange([])}>Clear attributes</button>
    </div>}
    <div className={styles.attributeChoices}>
      {choices.map(name => <label key={name}><input type="checkbox" checked={selected.includes(name)} disabled={!selected.includes(name) && selected.length >= 10}
        onChange={event => onChange(event.target.checked ? [...selected, name] : selected.filter(value => value !== name))} />{name}</label>)}
    </div>
    {!choices.length && <p>{options.length ? "No matching attributes. Try a shorter search." : "No attributes available for this semester."}</p>}
    {selected.length >= 10 && <p>You’ve selected 10 attributes. Remove one to choose another.</p>}
  </fieldset>;
}
