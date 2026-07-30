/**
 * 예상된 실패(설정 누락, 손상된 상태 파일, 스키마 오류)는 스택 트레이스 없이
 * 읽을 수 있는 메시지로 끝낸다. Actions 로그에서 원인을 바로 보기 위해서다.
 * 예상하지 못한 오류는 스택을 그대로 남겨 디버깅할 수 있게 둔다.
 */
export function installFailureHandler(): void {
  process.on('uncaughtException', report);
  process.on('unhandledRejection', report);
}

function report(error: unknown): never {
  if (error instanceof Error) {
    console.error(`\n오류: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    else console.error('(스택 트레이스는 DEBUG=1 로 실행하면 보입니다)');
  } else {
    console.error(`\n오류: ${String(error)}`);
  }
  process.exit(1);
}
