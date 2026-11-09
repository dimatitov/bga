import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import { type AiErrorView } from '../errorText';

/** Error by code (plan-frontend §6): `role="alert"`, `data-code`; focus stays where it was. */
export function AiErrorAlert({
  view,
  testId = 'dev-ai-error',
}: {
  view: AiErrorView;
  testId?: string;
}) {
  return (
    <Alert severity="error" role="alert" data-testid={testId} data-code={view.code}>
      <AlertTitle>{view.title}</AlertTitle>
      <Box component="p" sx={{ m: 0 }}>
        {view.text}
      </Box>
      {view.facts.map((fact) => (
        <Box component="p" key={fact} sx={{ m: 0 }}>
          {fact}
        </Box>
      ))}
      {view.hint ? (
        <Box component="p" sx={{ m: 0, mt: 0.5 }}>
          {view.hint}
        </Box>
      ) : null}
    </Alert>
  );
}
