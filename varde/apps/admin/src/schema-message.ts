/** Presentation only: validation remains in @varde/schema/template/validate. */
export function schemaMessage(message: string): string {
  const missing = /missing (nn|en|nb)/.exec(message);
  if (missing) {
    const languages: Record<string, string> = { nn: 'nynorsk', en: 'engelsk', nb: 'bokmål' };
    return `Tekst på ${languages[missing[1] ?? 'nn']} manglar.`;
  }
  if (/requires (nn|en)/.test(message))
    return 'Vel dei obligatoriske språka: nynorsk, og engelsk for kundeskjema.';
  if (message.includes('required_languages must be unique'))
    return 'Vel kvart språk berre éin gong.';
  if (message.includes('duplicate')) return 'ID-en er brukt fleire gonger. Vel ein unik ID.';
  if (message.includes('exactly one role')) return 'Vel nøyaktig eitt spørsmål for rolle.';
  if (message.includes('initials needs exactly one'))
    return 'Skjemaet må ha nøyaktig eitt felt for initialar.';
  if (message.includes('none has no identifier'))
    return 'Eit anonymt skjema skal ikkje ha felt for initialar.';
  if (message.includes('identifier'))
    return 'Feltet for initialar må vere tekst på éi linje, høgst 8 teikn, i fellesdelen.';
  if (message.includes('cycle'))
    return 'Vilkåra for vising viser til kvarandre i ein sirkel. Endre ei tilvising.';
  if (message.includes('unknown question'))
    return 'Tilvisinga viser til eit spørsmål som ikkje finst.';
  if (message.includes('unknown row')) return 'Tilvisinga viser til ei rad som ikkje finst.';
  if (message.includes('unknown option'))
    return 'Tilvisinga viser til eit svaralternativ som ikkje finst.';
  if (message.includes('choices_from must'))
    return 'Alternativa må hentast frå eit fleirvalsspørsmål tidlegare i skjemaet.';
  if (message.includes('needs anchor_key'))
    return 'Eit frose spørsmål må ha ein ankernøkkel (anchor_key).';
  if (message.includes('min_choices > max_choices'))
    return 'Minimum tal val kan ikkje vere større enn maksimum.';
  if (message.includes('scale.min must')) return 'Minimum på skalaen må vere mindre enn maksimum.';
  return 'Kontroller verdien og formatet i dette feltet.';
}
