// 킬 스위치: Cloud Billing 예산이 한도를 넘으면 Pub/Sub로 이 함수가 깨어나
// 프로젝트의 결제 계정 연결을 끊어 과금을 0으로 만든다.
//
// 주의: 결제가 끊기면 Cloud Storage 접근도 막혀(402) 앱의 동기화가 멈춘다.
// 이것은 '청구 폭탄'을 막는 최후의 안전장치이며, 평상시에는 걸리지 않는다.
// 다시 켜려면 Google Cloud 콘솔에서 결제 계정을 수동으로 다시 연결한다.
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
const { CloudBillingClient } = require('@google-cloud/billing');

const billing = new CloudBillingClient();

exports.stopBillingOnBudget = onMessagePublished('billing-alerts', async (event) => {
  let data;
  try { data = event.data.message.json; } catch (e) { return; }
  if (!data) return;

  // costAmount가 budgetAmount를 넘었을 때만 작동
  if (!(data.costAmount > data.budgetAmount)) {
    console.log('예산 이내:', data.costAmount, '/', data.budgetAmount);
    return;
  }

  const projectId = process.env.GCLOUD_PROJECT;
  const name = `projects/${projectId}`;

  const [info] = await billing.getProjectBillingInfo({ name });
  if (!info.billingEnabled) {
    console.log('이미 결제가 꺼져 있음');
    return;
  }
  await billing.updateProjectBillingInfo({
    name,
    projectBillingInfo: { billingAccountName: '' } // 빈 값 = 결제 계정 분리
  });
  console.log('⚠ 예산 초과로 결제를 차단했습니다:', projectId);
});
