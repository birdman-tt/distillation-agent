import { createPersona } from "@hall-of-fame/api-client";
import { useState } from "react";

import { getApiBaseUrl } from "../../lib/api.js";

export const CreatePersonaForm = () => {
  const [displayName, setDisplayName] = useState("");
  const [focus, setFocus] = useState("决策,表达");
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async () => {
    const persona = await createPersona(getApiBaseUrl(), {
      displayName,
      personaType: "ORIGINAL_PERSONA",
      originType: "USER",
      distillFocus: focus.split(",").map((item) => item.trim()).filter(Boolean),
    });
    setResult(persona.id);
  };

  return (
    <section>
      <h1>创建对象</h1>
      <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="对象名" />
      <input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="蒸馏重点，用逗号分隔" />
      <button type="button" onClick={() => void handleSubmit()} disabled={!displayName.trim()}>
        创建
      </button>
      {result ? <p>已创建对象：{result}</p> : null}
    </section>
  );
};
