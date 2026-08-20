-- One-time doctor revenue consolidation for 28지킴이치과.
-- Moves 박흥재 and 이준명 monthly doctor revenue into 박흥열,
-- then removes the two former names from the stored doctorData object.
-- Run this once in the Supabase SQL Editor.

do $$
declare
    target_clinic_id uuid;
    source_row record;
    doctor_data jsonb;
    target_data jsonb;
    former_doctor_one jsonb;
    former_doctor_two jsonb;
    merged_doctor_data jsonb;
    recalculated_net_sales numeric;
    recalculated_insurance numeric;
    updated_payload jsonb;
    updated_month_count integer := 0;
begin
    select id
    into target_clinic_id
    from public.clinics
    where name = '28지킴이치과'
    limit 1;

    if target_clinic_id is null then
        raise exception '치과명 "28지킴이치과"를 clinics 테이블에서 찾을 수 없습니다.';
    end if;

    for source_row in
        select id, payload
        from public.analytics_data
        where clinic_id = target_clinic_id
          and category = 'sales'
          and sub_category = 'doctor_revenue'
          and (payload -> 'doctorData') ?| array['박흥재', '이준명']
        for update
    loop
        doctor_data := coalesce(source_row.payload -> 'doctorData', '{}'::jsonb);
        target_data := coalesce(doctor_data -> '박흥열', '{}'::jsonb);
        former_doctor_one := coalesce(doctor_data -> '박흥재', '{}'::jsonb);
        former_doctor_two := coalesce(doctor_data -> '이준명', '{}'::jsonb);

        merged_doctor_data := (doctor_data - '박흥재' - '이준명') || jsonb_build_object(
            '박흥열',
            jsonb_build_object(
                'pure',
                coalesce((target_data ->> 'pure')::numeric, 0)
                    + coalesce((former_doctor_one ->> 'pure')::numeric, 0)
                    + coalesce((former_doctor_two ->> 'pure')::numeric, 0),
                'insurance',
                coalesce((target_data ->> 'insurance')::numeric, 0)
                    + coalesce((former_doctor_one ->> 'insurance')::numeric, 0)
                    + coalesce((former_doctor_two ->> 'insurance')::numeric, 0)
            )
        );

        select
            coalesce(sum(coalesce((value ->> 'pure')::numeric, 0)), 0),
            coalesce(sum(coalesce((value ->> 'insurance')::numeric, 0)), 0)
        into recalculated_net_sales, recalculated_insurance
        from jsonb_each(merged_doctor_data);

        updated_payload := jsonb_set(source_row.payload, '{doctorData}', merged_doctor_data, true);
        updated_payload := jsonb_set(updated_payload, '{netSales}', to_jsonb(recalculated_net_sales), true);
        updated_payload := jsonb_set(updated_payload, '{insurance}', to_jsonb(recalculated_insurance), true);
        updated_payload := jsonb_set(updated_payload, '{total}', to_jsonb(recalculated_net_sales + recalculated_insurance), true);

        update public.analytics_data
        set payload = updated_payload,
            updated_at = now()
        where id = source_row.id;

        updated_month_count := updated_month_count + 1;
    end loop;

    insert into public.analytics_audit_logs (
        clinic_id,
        action_type,
        status,
        category,
        sub_category,
        summary,
        metadata
    ) values (
        target_clinic_id,
        'update',
        'success',
        'sales',
        'doctor_revenue',
        jsonb_build_object(
            'label', '의사별 매출 일회성 병합',
            'updated_month_count', updated_month_count
        ),
        jsonb_build_object(
            'target_doctor', '박흥열',
            'merged_doctors', jsonb_build_array('박흥재', '이준명')
        )
    );

    raise notice '%개 월의 의사별 매출 데이터를 박흥열 원장으로 병합했습니다.', updated_month_count;
end
$$;
