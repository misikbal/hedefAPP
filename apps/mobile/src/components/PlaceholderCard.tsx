import { Card } from './Card';
import { Txt } from './Txt';

/** Faz 0 iskelet ekranları için geçici içerik kartı. */
export function PlaceholderCard({ phase, text }: { phase: number; text: string }) {
  return (
    <Card>
      <Txt variant="label" color="accTx">{`FAZ ${phase}`}</Txt>
      <Txt color="tx2">{text}</Txt>
    </Card>
  );
}
