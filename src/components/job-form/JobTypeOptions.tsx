import { jobTypeOptions } from "./job-form-helpers";

export default function JobTypeOptions({ values = [] }: { values?: string[] }) {
  return jobTypeOptions(values).map((option) => <option key={option.value} value={option.value}>{option.label}</option>);
}
