# Sample forms for the accuracy test set

Downloaded 2026-10-31 from the official sources below, then rendered to JPG with
`pdftoppm -jpeg -jpegopt quality=90 -r 200 pdf/<id>.pdf jpg/<id>` (one JPG per page, `<id>-<page>.jpg`).
All are blank or sample documents with no real patient data.

These are clean digital renders, not phone photos. For realistic tests, also make degraded copies
(skew, dim light, creases, low resolution) and keep the originals as a baseline.

**Licensing.** US federal government works are generally public domain, so those files may be committed.
The two `state` files are kept out of git (see `.gitignore`) until their reuse terms are checked.
Anything from a private hospital or insurer should never be committed.

| id | what it is | origin | pages | source |
|---|---|---|---|---|
| `cms-1500-claim-form` | CMS-1500 claim form (sample copy) | federal | 4 | https://www.cms.gov/medicare/cms-forms/cms-forms/downloads/cms1500.pdf |
| `medicare-summary-notice-part-a` | Sample Medicare Summary Notice, Part A | federal | 6 | https://www.cms.gov/medicare/medicare-general-information/msn/downloads/sample-part-a-medicare-summary-notice.pdf |
| `good-faith-estimate` | No Surprises Act Good Faith Estimate example | federal | 12 | https://www.cms.gov/files/document/good-faith-estimate-example.pdf |
| `sample-eob` | Annotated sample Explanation of Benefits | federal | 1 | https://www.cms.gov/files/document/11819-sample-explanation-benefits-508.pdf |
| `va-10-10ez-health-benefits` | VA health benefits enrollment application | federal | 6 | https://www.va.gov/vaforms/medical/pdf/VA%20Form%2010-10EZ.pdf |
| `marketplace-application` | Marketplace "Application for Health Coverage & Help Paying Costs" | federal | 14 | https://www.cms.gov/marketplace/applications-and-forms/marketplace-application-for-family.pdf |
| `hipaa-authorization-cms-10106` | Medicare authorization to disclose personal health information | federal | 3 | https://www.cms.gov/medicare/cms-forms/cms-forms/downloads/cms10106.pdf |
| `hipaa-authorization-va-10-5345` | VA request for and authorization to release health information | federal | 2 | https://www.va.gov/vaforms/medical/pdf/va_form_10-5345_fillable.pdf |
| `advance-directive-va-10-0137` | VA advance directive (health care power of attorney + living will) | federal | 6 | https://www.va.gov/vaforms/medical/pdf/VA%20Form-10-0137.pdf |
| `research-consent-niaid-daids` | NIAID DAIDS sample informed consent template | federal | 17 | https://www.niaid.nih.gov/sites/default/files/daids-specific-general-icf_v4.pdf |
| `intake-va-mental-health` | VA mental health intake packet | federal | 12 | https://www.va.gov/files/2022-11/intake_packet.pdf |
| `intake-patient-registration` | Military treatment facility patient registration form (NIH-hosted). **Only page 1 is the patient form; pages 2-4 are an unrelated staff EHR access request** | federal | 4 | https://ors.od.nih.gov/ser/dpsac/administrators/onboarding-new-staff/info-for-fellows-and-summer-interns/Documents/WRNMMC_Fellows_Patient_Registration_Form.pdf |
| `vaccine-information-statement-flu` | CDC Vaccine Information Statement, inactivated flu (hosted by immunize.org) | federal text | 2 | https://www.immunize.org/wp-content/uploads/vis/flu_inactive.pdf |
| `prior-auth-texas-nofr001` | Texas standard prior authorization request (health care services) | **state** | 2 | https://www.tdi.texas.gov/forms/lhlifehealth/nofr001.pdf |
| `advance-directive-california` | California Advance Health Care Directive | **state** | 7 | https://oag.ca.gov/system/files/media/ProbateCodeAdvanceHealthCareDirectiveForm-fillable.pdf |

## Not downloaded (the sites refuse scripted downloads with HTTP 403)

Save these by hand from a browser if you want them in the set:

- HHS model Notice of Privacy Practices: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/model-notices-privacy-practices/index.html
- SSA-827 Authorization to Disclose Information: https://www.ssa.gov/forms/ssa-827.pdf
- Federal single streamlined Medicaid application: https://www.medicaid.gov/state-resource-center/mac-learning-collaboratives/downloads/single-streamlined-application.pdf
- Texas Medicaid streamlined application (H1205): https://hhs.texas.gov/regulations/forms/1000-1999/form-h1205-texas-streamlined-application

## Not found

- A blank UB-04 / CMS-1450 (CMS says to get these from a printer; the official layout is licensed by the NUBC).
- Sample itemized hospital bills (none published by an official source).
- Private hospital intake packets and insurer-specific EOBs: skipped because they are copyrighted.

## Recreating the files

The PDFs and JPGs are not committed (about 70 MB). From the repository root:

```
mkdir -p eval/forms/pdf eval/forms/jpg
sh eval/forms/fetch.sh eval/forms/forms.list eval/forms/pdf
for f in eval/forms/pdf/*.pdf; do
  pdftoppm -jpeg -jpegopt quality=90 -r 200 "$f" "eval/forms/jpg/$(basename "$f" .pdf)"
done
```

Needs `curl` and `pdftoppm` (poppler). Government sites move files around, so a URL may need updating.
The two `state` files should stay out of git until their reuse terms are checked.
